/**
 * Redis Client - Shared across application
 * Uses @db-bridge/redis for unified Redis access
 *
 * Used by:
 * - db-bridge query caching
 * - Rate limiting
 * - Session management
 * - Custom application cache
 */
import { RedisAdapter } from '@db-bridge/redis';
import type { Redis } from 'ioredis';
import config from '../../config/env.js';
import logger from '../logger/logger.js';

// Singleton Redis adapter
let redisAdapter: RedisAdapter | null = null;

/**
 * Initialize Redis connection
 * Call this during application bootstrap
 */
export async function initializeRedis(): Promise<RedisAdapter | null> {
  if (!config.REDIS_ENABLED) {
    logger.info('Redis disabled (REDIS_ENABLED=false)');
    return null;
  }

  if (redisAdapter) {
    return redisAdapter;
  }

  try {
    redisAdapter = new RedisAdapter({
      redis: {
        host: config.REDIS_SERVER,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD || undefined,
        db: 0,
      },
      keyPrefix: `${config.SERVICE_NAME}:`,
      ttl: 300, // 5 min default
      connectionTimeout: 10000,
      commandTimeout: 5000,
      retryOptions: {
        maxRetries: 10,
        retryDelay: 1000,
      },
    });

    await redisAdapter.connect();
    logger.info('Redis connected via @db-bridge/redis');

    return redisAdapter;
  } catch (error) {
    logger.error({ err: error }, 'Redis connection failed');
    redisAdapter = null;
    return null;
  }
}

/**
 * Get Redis adapter instance
 * Returns null if Redis is disabled or not connected
 */
export function getRedisAdapter(): RedisAdapter | null {
  return redisAdapter;
}

/**
 * Get underlying ioredis client for advanced operations
 * Use this for raw Redis commands not exposed by the adapter
 */
export function getRedisClient(): Redis | null {
  if (!redisAdapter) {
    return null;
  }
  return redisAdapter.getClient() as Redis;
}

/**
 * Check Redis connection health
 */
export async function checkRedisHealth(): Promise<{
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}> {
  if (!config.REDIS_ENABLED || !redisAdapter) {
    return { healthy: false, error: 'Redis not configured' };
  }

  try {
    const start = Date.now();
    await redisAdapter.ping();
    const latencyMs = Date.now() - start;

    return {
      healthy: latencyMs < 100,
      latencyMs,
    };
  } catch (error) {
    return {
      healthy: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisAdapter) {
    try {
      await redisAdapter.disconnect();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error({ err: error }, 'Error closing Redis');
    }
    redisAdapter = null;
  }
}

// ============================================
// Convenience methods for common operations
// ============================================

/**
 * Get value from cache
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redisAdapter) {
    return null;
  }
  return redisAdapter.get<T>(key);
}

/**
 * Set value in cache
 */
export async function cacheSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  if (!redisAdapter) {
    return;
  }
  await redisAdapter.set(key, value, ttlSeconds);
}

/**
 * Delete from cache
 */
export async function cacheDel(key: string): Promise<boolean> {
  if (!redisAdapter) {
    return false;
  }
  return redisAdapter.delete(key);
}

/**
 * Check if key exists
 */
export async function cacheExists(key: string): Promise<boolean> {
  if (!redisAdapter) {
    return false;
  }
  return redisAdapter.exists(key);
}

/**
 * Get multiple values
 */
export async function cacheGetMany<T>(keys: string[]): Promise<(T | null)[]> {
  if (!redisAdapter) {
    return keys.map(() => null);
  }
  return redisAdapter.mget<T>(keys);
}

/**
 * Delete keys by pattern using SCAN + UNLINK.
 *
 * Never uses KEYS: it is O(N) over the whole keyspace and blocks the Redis
 * event loop. SCAN iterates in small batches; UNLINK reclaims memory in a
 * background thread instead of blocking like DEL.
 */
export async function cacheDelPattern(pattern: string): Promise<number> {
  const client = getRedisClient();
  if (!client) {
    return 0;
  }

  // The adapter stores keys with a `${SERVICE_NAME}:` prefix; the raw client
  // operates on full keys, so the prefix must be applied to the match pattern
  const fullPattern = `${config.SERVICE_NAME}:${pattern}`;
  let deleted = 0;
  let cursor = '0';

  do {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', fullPattern, 'COUNT', 250);
    cursor = nextCursor;
    if (keys.length > 0) {
      deleted += await client.unlink(...keys);
    }
  } while (cursor !== '0');

  return deleted;
}

/**
 * Increment counter
 */
export async function cacheIncr(key: string, by = 1): Promise<number> {
  if (!redisAdapter) {
    return 0;
  }
  return redisAdapter.increment(key, by);
}

/**
 * Set if not exists (for distributed locking)
 */
export async function cacheSetNX(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<boolean> {
  if (!redisAdapter) {
    return false;
  }
  return redisAdapter.setNX(key, value, ttlSeconds);
}

// ============================================
// Exports
// ============================================

export { RedisAdapter };
export type { Redis };
