import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Redis from "ioredis";

const { mockRedisInstance } = vi.hoisted(() => ({
  mockRedisInstance: {
    set: vi.fn(),
    get: vi.fn(),
    exists: vi.fn(),
    eval: vi.fn(),
    on: vi.fn(),
    connect: vi.fn(),
    status: "wait",
  },
}));

vi.mock("ioredis", () => {
  const MockRedis = vi.fn(function () {
    return mockRedisInstance;
  });
  return { default: MockRedis, Redis: MockRedis };
});

describe("UniversalSyncLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockRedisInstance.status = "wait";
    mockRedisInstance.set.mockResolvedValue("OK");
    mockRedisInstance.get.mockResolvedValue(null);
    mockRedisInstance.exists.mockResolvedValue(0);
    mockRedisInstance.eval.mockResolvedValue(1);
    mockRedisInstance.connect.mockImplementation(async () => {
      mockRedisInstance.status = "ready";
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("uses exclusive memory leases and token-checked release in development", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REDIS_URL", "redis://configured-remote-host:6379");
    const { syncLock } = await import("../sync-lock.js");

    const lease = await syncLock.acquire("sync:item:1", 10);
    expect(Redis).not.toHaveBeenCalled();
    expect(lease).toEqual(expect.any(String));
    await expect(syncLock.acquire("sync:item:1", 10)).resolves.toBeUndefined();
    expect(await syncLock.isLocked("sync:item:1")).toBe(true);

    await syncLock.release("sync:item:1", "not-the-owner");
    expect(await syncLock.isLocked("sync:item:1")).toBe(true);
    await syncLock.release("sync:item:1", lease);
    expect(await syncLock.isLocked("sync:item:1")).toBe(false);
  });

  it("renews active leases and preserves completed claims until their TTL expires", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.REDIS_URL;
    const { syncLock } = await import("../sync-lock.js");

    const lease = await syncLock.acquire("sync:renew", 3);
    vi.advanceTimersByTime(1100);
    await Promise.resolve();
    expect(await syncLock.isLocked("sync:renew")).toBe(true);

    await syncLock.complete("sync:renew", lease!);
    vi.advanceTimersByTime(3000);
    expect(await syncLock.isLocked("sync:renew")).toBe(false);
  });

  it("uses process-local leases for test runs even when Redis is configured", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("REDIS_URL", "redis://configured-remote-host:6379");
    const { syncLock } = await import("../sync-lock.js");

    await expect(syncLock.acquire("test:key", 10)).resolves.toEqual(
      expect.any(String),
    );
    expect(Redis).not.toHaveBeenCalled();
  });

  it("creates Redis leases with NX and an explicit expiry", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    const { syncLock } = await import("../sync-lock.js");

    const lease = await syncLock.acquire("redis:key:1", 30);
    expect(Redis).toHaveBeenCalledWith(
      "redis://localhost:6379",
      expect.objectContaining({
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        lazyConnect: true,
        enableOfflineQueue: false,
      }),
    );
    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      "redis:key:1",
      lease,
      "EX",
      30,
      "NX",
    );
  });

  it("checks Redis lease existence and releases only the matching owner token", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    const { syncLock } = await import("../sync-lock.js");

    mockRedisInstance.exists.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    expect(await syncLock.isLocked("redis:key:1")).toBe(true);
    expect(await syncLock.isLocked("redis:key:1")).toBe(false);

    await syncLock.release("redis:key:1", "owner-token");
    expect(mockRedisInstance.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('get'"),
      1,
      "redis:key:1",
      "owner-token",
    );
  });

  it("waits for Redis readiness before checking a lock", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    const { syncLock } = await import("../sync-lock.js");

    await expect(syncLock.isLocked("redis:key:startup")).resolves.toBe(false);

    expect(mockRedisInstance.connect).toHaveBeenCalledOnce();
    expect(mockRedisInstance.exists).toHaveBeenCalledWith(
      "redis:key:startup",
    );
    expect(mockRedisInstance.connect.mock.invocationCallOrder[0]).toBeLessThan(
      mockRedisInstance.exists.mock.invocationCallOrder[0],
    );
  });

  it("fails closed when Redis is unavailable in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    mockRedisInstance.set.mockRejectedValue(new Error("Redis unavailable"));
    const { syncLock } = await import("../sync-lock.js");

    await expect(syncLock.acquire("redis:key:failure", 10)).rejects.toThrow(
      "Redis unavailable",
    );
  });

  it("requires Redis configuration for production locks", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.REDIS_URL;
    const { syncLock } = await import("../sync-lock.js");

    await expect(syncLock.acquire("production:key", 10)).rejects.toThrow(
      "REDIS_URL is required",
    );
  });
});
