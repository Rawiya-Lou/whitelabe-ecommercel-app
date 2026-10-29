import Redis from "ioredis";

export class UniversalSyncLock {
  private redisClient: Redis | null = null;
  private memoryLocks = new Map<string, number>();

  constructor(customRedisUrl?: string) {
    const isProd = process.env.NODE_ENV === "production";
    const redisUrl =
      customRedisUrl ?? (isProd ? process.env.REDIS_URL : undefined);

    if (redisUrl) {
      try {
        this.redisClient = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
          lazyConnect: true,
          retryStrategy: () => null,
          enableOfflineQueue: false,
        });

        this.redisClient.on?.("error", () => {
          this.redisClient = null;
        });

        // Safely check if connect() returns a Promise before calling .catch()
        const connectPromise = this.redisClient.connect?.();
        if (connectPromise && typeof connectPromise.catch === "function") {
          connectPromise.catch(() => {
            this.redisClient = null;
          });
        }
      } catch (err) {
        this.redisClient = null;
      }
    }
  }

  async acquire(key: string, ttlSeconds = 15): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.set(key, "locked", "EX", ttlSeconds);
        return;
      } catch (e) {
        this.redisClient = null;
      }
    }
    this.memoryLocks.set(key, Date.now() + ttlSeconds * 1000);
  }

  async isLocked(key: string): Promise<boolean> {
    if (this.redisClient) {
      try {
        const val = await this.redisClient.get(key);
        return val !== null;
      } catch (e) {
        this.redisClient = null;
      }
    }

    const expiresAt = this.memoryLocks.get(key);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.memoryLocks.delete(key);
      return false;
    }
    return true;
  }

  async release(key: string): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.del(key);
      } catch (e) {}
    }
    this.memoryLocks.delete(key);
  }
}

export const syncLock = new UniversalSyncLock();
