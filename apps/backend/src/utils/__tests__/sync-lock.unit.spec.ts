import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Redis from "ioredis";

const { mockRedisInstance } = vi.hoisted(() => {
  return {
    mockRedisInstance: {
      set: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
      on: vi.fn(),
      connect: vi.fn(),
    },
  };
});

vi.mock("ioredis", () => {
  const MockRedis = vi.fn(function () {
    return mockRedisInstance;
  });
  return {
    default: MockRedis,
    Redis: MockRedis,
  };
});

describe("UniversalSyncLock - Professional Unit & Resilience Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Default healthy mock responses
    mockRedisInstance.set.mockResolvedValue("OK");
    mockRedisInstance.get.mockResolvedValue("locked");
    mockRedisInstance.del.mockResolvedValue(1);
    mockRedisInstance.connect.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("In-Memory Mode (NODE_ENV !== 'production' or REDIS_URL absent)", () => {
    let syncLock: any;

    beforeEach(async () => {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", "development");
      delete process.env.REDIS_URL;

      const mod = await import("../sync-lock.js");
      syncLock = mod.syncLock;
    });

    it("should acquire and verify an active lock", async () => {
      expect(await syncLock.isLocked("sync:item:1")).toBe(false);

      await syncLock.acquire("sync:item:1", 10);

      expect(await syncLock.isLocked("sync:item:1")).toBe(true);
    });

    it("should release a locked key immediately", async () => {
      await syncLock.acquire("sync:item:2", 15);
      expect(await syncLock.isLocked("sync:item:2")).toBe(true);

      await syncLock.release("sync:item:2");

      expect(await syncLock.isLocked("sync:item:2")).toBe(false);
    });

    it("should automatically expire lock once TTL elapses", async () => {
      await syncLock.acquire("sync:item:expiring", 10); // 10 seconds TTL

      vi.advanceTimersByTime(9900);
      expect(await syncLock.isLocked("sync:item:expiring")).toBe(true);

      vi.advanceTimersByTime(200);
      expect(await syncLock.isLocked("sync:item:expiring")).toBe(false);
    });

    it("should isolate separate lock keys independently", async () => {
      await syncLock.acquire("key:A", 10);

      expect(await syncLock.isLocked("key:A")).toBe(true);
      expect(await syncLock.isLocked("key:B")).toBe(false);

      await syncLock.release("key:A");
      expect(await syncLock.isLocked("key:A")).toBe(false);
    });

    it("should handle releasing a non-existent key without crashing", async () => {
      await expect(syncLock.release("key:ghost")).resolves.not.toThrow();
      expect(await syncLock.isLocked("key:ghost")).toBe(false);
    });
  });

  describe("Redis Mode (NODE_ENV === 'production' & REDIS_URL present)", () => {
    let syncLock: any;

    beforeEach(async () => {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("REDIS_URL", "redis://localhost:6379");

      const mod = await import("../sync-lock.js");
      syncLock = mod.syncLock;
    });

    it("should initialize Redis with non-blocking fail-safe options", () => {
      expect(Redis).toHaveBeenCalledWith(
        "redis://localhost:6379",
        expect.objectContaining({
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
          lazyConnect: true,
          enableOfflineQueue: false,
        }),
      );
    });

    it("should acquire lock via Redis SET command with EX TTL", async () => {
      await syncLock.acquire("redis:key:1", 30);

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        "redis:key:1",
        "locked",
        "EX",
        30,
      );
    });

    it("should check lock status via Redis GET command", async () => {
      mockRedisInstance.get.mockResolvedValueOnce("locked");
      expect(await syncLock.isLocked("redis:key:1")).toBe(true);

      mockRedisInstance.get.mockResolvedValueOnce(null);
      expect(await syncLock.isLocked("redis:key:1")).toBe(false);

      expect(mockRedisInstance.get).toHaveBeenCalledWith("redis:key:1");
    });

    it("should release lock via Redis DEL command and clear memory", async () => {
      await syncLock.release("redis:key:1");

      expect(mockRedisInstance.del).toHaveBeenCalledWith("redis:key:1");
    });
  });

  describe("Fault Tolerance & Seamless Fallback", () => {
    let syncLock: any;

    beforeEach(async () => {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("REDIS_URL", "redis://localhost:6379");

      mockRedisInstance.set.mockRejectedValue(
        new Error("Redis connection refused"),
      );
      mockRedisInstance.get.mockRejectedValue(
        new Error("Redis socket timeout"),
      );
      mockRedisInstance.del.mockRejectedValue(new Error("Redis offline"));
      mockRedisInstance.connect.mockRejectedValue(new Error("Cannot connect"));

      const mod = await import("../sync-lock.js");
      syncLock = mod.syncLock;
    });

    it("should seamlessly fall back to memory locks if Redis .set() crashes", async () => {
      await expect(syncLock.acquire("fallback:key", 10)).resolves.not.toThrow();

      expect(await syncLock.isLocked("fallback:key")).toBe(true);

      vi.advanceTimersByTime(11000);
      expect(await syncLock.isLocked("fallback:key")).toBe(false);
    });

    it("should seamlessly fall back to memory check if Redis .get() crashes", async () => {
      await syncLock.acquire("fallback:get", 15);

      await expect(syncLock.isLocked("fallback:get")).resolves.toBe(true);
    });

    it("should not throw error when Redis .del() crashes during release", async () => {
      await syncLock.acquire("fallback:del", 15);

      await expect(syncLock.release("fallback:del")).resolves.not.toThrow();
      expect(await syncLock.isLocked("fallback:del")).toBe(false);
    });
  });
});
