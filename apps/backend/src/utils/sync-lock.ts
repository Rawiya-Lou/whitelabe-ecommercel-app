import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { MedusaError } from "@medusajs/framework/utils";

type Lease = {
  token: string;
  timer?: NodeJS.Timeout;
};

type MemoryValue = {
  value: string;
  expiresAt: number;
};

const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
const RENEW_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end";
const CONSUME_SCRIPT =
  "local value = redis.call('get', KEYS[1]); if value then redis.call('del', KEYS[1]); return value end; return nil";

export class SyncLockUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncLockUnavailableError";
  }
}

export class UniversalSyncLock {
  private readonly redisClient: Redis | null;
  private readonly leases = new Map<string, Lease>();
  private readonly memoryValues = new Map<string, MemoryValue>();
  private redisReadyPromise?: Promise<void>;

  constructor(customRedisUrl?: string) {
    const isProd = process.env.NODE_ENV === "production";
    const redisUrl =
      customRedisUrl ?? (isProd ? process.env.REDIS_URL : undefined);

    if (!redisUrl) {
      this.redisClient = null;
      return;
    }

    this.redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
      retryStrategy: (attempt: number) =>
        Math.min(3000, 100 * 2 ** Math.min(attempt - 1, 5)),
      enableOfflineQueue: false,
    });

    this.redisClient.on("error", (error: Error) => {
      console.error(
        `[Sanity Sync Lock] Redis client error: ${error.message}`,
      );
    });
  }

  async acquire(key: string, ttlSeconds = 30): Promise<string | undefined> {
    this.validateTtl(ttlSeconds);
    const token = randomUUID();

    if (this.redisClient) {
      await this.ensureRedisReady();
      const result = await this.redisClient.set(
        key,
        token,
        "EX",
        ttlSeconds,
        "NX",
      );
      if (result !== "OK") return undefined;
    } else {
      this.assertMemoryModeAllowed();
      this.removeExpiredMemoryValue(key);
      if (this.memoryValues.has(key)) return undefined;
      this.memoryValues.set(key, {
        value: token,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    }

    const lease: Lease = { token };
    lease.timer = setInterval(() => {
      void this.renew(key, token, ttlSeconds).catch(() => {
        this.stopRenewal(key, token);
      });
    }, Math.max(1000, Math.floor((ttlSeconds * 1000) / 3)));
    lease.timer.unref?.();
    this.leases.set(key, lease);
    return token;
  }

  async renew(
    key: string,
    token: string,
    ttlSeconds = 30,
  ): Promise<boolean> {
    this.validateTtl(ttlSeconds);

    if (this.redisClient) {
      await this.ensureRedisReady();
      const result = await this.redisClient.eval(
        RENEW_SCRIPT,
        1,
        key,
        token,
        ttlSeconds,
      );
      return Number(result) === 1;
    }

    this.assertMemoryModeAllowed();
    this.removeExpiredMemoryValue(key);
    const current = this.memoryValues.get(key);
    if (current?.value !== token) return false;
    this.memoryValues.set(key, {
      value: token,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return true;
  }

  async isLocked(key: string): Promise<boolean> {
    if (this.redisClient) {
      await this.ensureRedisReady();
      return (await this.redisClient.exists(key)) === 1;
    }

    this.assertMemoryModeAllowed();
    this.removeExpiredMemoryValue(key);
    return this.memoryValues.has(key);
  }

  async release(key: string, token?: string): Promise<void> {
    const lease = this.leases.get(key);
    const ownerToken = token ?? lease?.token;
    if (!ownerToken) return;

    this.stopRenewal(key, ownerToken);
    if (this.redisClient) {
      await this.ensureRedisReady();
      await this.redisClient.eval(RELEASE_SCRIPT, 1, key, ownerToken);
      return;
    }

    this.assertMemoryModeAllowed();
    const current = this.memoryValues.get(key);
    if (current?.value === ownerToken) this.memoryValues.delete(key);
  }

  async complete(key: string, token: string): Promise<void> {
    this.stopRenewal(key, token);
  }

  async mark(key: string, value: string, ttlSeconds = 30): Promise<void> {
    this.validateTtl(ttlSeconds);
    if (this.redisClient) {
      await this.ensureRedisReady();
      await this.redisClient.set(key, value, "EX", ttlSeconds);
      return;
    }

    this.assertMemoryModeAllowed();
    this.memoryValues.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async matches(key: string, value: string): Promise<boolean> {
    if (this.redisClient) {
      await this.ensureRedisReady();
      return (await this.redisClient.get(key)) === value;
    }

    this.assertMemoryModeAllowed();
    this.removeExpiredMemoryValue(key);
    return this.memoryValues.get(key)?.value === value;
  }

  async consume(key: string): Promise<string | undefined> {
    if (this.redisClient) {
      await this.ensureRedisReady();
      const value = await this.redisClient.eval(CONSUME_SCRIPT, 1, key);
      return typeof value === "string" ? value : undefined;
    }

    this.assertMemoryModeAllowed();
    this.removeExpiredMemoryValue(key);
    const value = this.memoryValues.get(key)?.value;
    if (value) this.memoryValues.delete(key);
    return value;
  }

  private ensureRedisReady(): Promise<void> {
    const client = this.redisClient;
    if (!client || client.status === "ready") return Promise.resolve();
    if (this.redisReadyPromise) return this.redisReadyPromise;

    let connectionPromise: Promise<void>;
    if (client.status === "wait" || client.status === "end") {
      connectionPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new SyncLockUnavailableError(
              "Timed out waiting for the Redis sync-lock connection.",
            ),
          );
        }, 10000);
        timeout.unref?.();
        client.connect().then(
          () => {
            clearTimeout(timeout);
            resolve();
          },
          (error: unknown) => {
            clearTimeout(timeout);
            reject(error);
          },
        );
      });
    } else {
      connectionPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(
            new SyncLockUnavailableError(
              "Timed out waiting for the Redis sync-lock connection.",
            ),
          );
        }, 10000);
        timeout.unref?.();

        const onReady = () => {
          cleanup();
          resolve();
        };
        const onEnd = () => {
          cleanup();
          reject(
            new SyncLockUnavailableError(
              "Redis closed the sync-lock connection before it became ready.",
            ),
          );
        };
        const cleanup = () => {
          clearTimeout(timeout);
          client.removeListener("ready", onReady);
          client.removeListener("end", onEnd);
        };

        client.once("ready", onReady);
        client.once("end", onEnd);
        if (client.status === "ready") onReady();
      });
    }

    this.redisReadyPromise = connectionPromise
      .then(() => undefined)
      .finally(() => {
        this.redisReadyPromise = undefined;
      });
    return this.redisReadyPromise;
  }

  private stopRenewal(key: string, token: string): void {
    const lease = this.leases.get(key);
    if (!lease || lease.token !== token) return;
    if (lease.timer) clearInterval(lease.timer);
    this.leases.delete(key);
  }

  private removeExpiredMemoryValue(key: string): void {
    const value = this.memoryValues.get(key);
    if (value && value.expiresAt <= Date.now()) this.memoryValues.delete(key);
  }

  private assertMemoryModeAllowed(): void {
    if (process.env.NODE_ENV === "production") {
      throw new SyncLockUnavailableError(
        "REDIS_URL is required for distributed Sanity sync locks in production.",
      );
    }
  }

  private validateTtl(ttlSeconds: number): void {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE ,"Sync lock TTL must be a positive integer in seconds.");
    }
  }
}

export const syncLock = new UniversalSyncLock();
