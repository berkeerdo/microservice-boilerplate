import { Redis } from 'ioredis';
import config from '../../config/env.js';
import logger from '../logger/logger.js';

/**
 * Redis client instance
 * Used for caching and session management
 */
export const redisClient = new Redis({
  host: config.REDIS_SERVER,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
  db: 0,
  keyPrefix: `${config.SERVICE_NAME}:`,
  lazyConnect: true, // We manually connect on startup
  retryStrategy: (times: number) => {
    return Math.min(times * 50, 2000);
  },
  maxRetriesPerRequest: 3,
});

redisClient.on('connect', () => {
  logger.info('Redis connected successfully');
});

redisClient.on('error', (err: Error) => {
  logger.error({ err }, 'Redis connection error');
});

redisClient.on('close', () => {
  logger.warn('Redis connection closed');
});

redisClient.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});

/**
 * Initialize Redis connection on startup
 * Call this during application bootstrap
 */
export async function initializeRedis(): Promise<void> {
  if (!config.REDIS_ENABLED) {
    logger.info('Redis is disabled, skipping initialization');
    return;
  }

  try {
    if (redisClient.status === 'wait') {
      await redisClient.connect();
      logger.info('Redis initialized successfully');
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Redis - continuing without cache');
  }
}

/**
 * Check Redis connection health
 */
export async function checkRedisConnection(): Promise<boolean> {
  if (!config.REDIS_ENABLED) {
    return false;
  }

  try {
    if (redisClient.status === 'ready') {
      await redisClient.ping();
      return true;
    } else if (redisClient.status === 'wait') {
      await redisClient.connect();
      return true;
    }
    return false;
  } catch (error) {
    logger.error({ err: error }, 'Redis health check failed');
    return false;
  }
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedisConnection(): Promise<void> {
  try {
    await redisClient.quit();
    logger.info('Redis connection closed gracefully');
  } catch (error) {
    logger.error({ err: error }, 'Error closing Redis connection');
  }
}

/**
 * Get Redis client instance (type-safe getter)
 * Returns null if Redis is not connected or disabled
 */
export function getRedisClient(): Redis | null {
  if (!config.REDIS_ENABLED) {
    return null;
  }
  if (redisClient.status === 'ready') {
    return redisClient;
  }
  return null;
}

export default redisClient;
