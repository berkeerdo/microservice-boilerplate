/**
 * Database Module
 * Uses MySQLAdapter from db-bridge with shared Redis cache
 */
import { MySQLAdapter } from '@db-bridge/mysql';
import { HealthChecker, PerformanceMonitor } from '@db-bridge/core';
import type { QueryBuilder, Transaction } from '@db-bridge/mysql';
import type { QueryParams, HealthCheckResult } from '@db-bridge/core';
import config from '../../config/env.js';
import logger from '../logger/logger.js';
import { getRedisAdapter } from '../redis/redis.js';

// Singletons
let adapter: MySQLAdapter | null = null;
let healthChecker: HealthChecker | null = null;
let perfMonitor: PerformanceMonitor | null = null;

// Cache statistics
const cacheStats = {
  hits: 0,
  misses: 0,
};

// ============================================
// Connection Management
// ============================================

/**
 * Initialize database connection
 */
export async function initializeDatabase(): Promise<MySQLAdapter> {
  if (adapter) {
    return adapter;
  }

  adapter = new MySQLAdapter();

  await adapter.connect({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USERNAME,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    pool: {
      max: config.DB_CONNECTION_LIMIT,
      queueLimit: config.DB_QUEUE_LIMIT,
    },
    connectionTimeout: config.DB_CONNECT_TIMEOUT,
  });

  logger.info('Database connected');

  // Initialize health checker
  healthChecker = new HealthChecker(adapter, {
    interval: 30_000,
    timeout: 5000,
    retries: 3,
    onHealthChange: (result: HealthCheckResult) => {
      const level =
        result.status === 'unhealthy' ? 'error' : result.status === 'degraded' ? 'warn' : 'info';
      logger[level]({ status: result.status, latency: result.latency }, 'Database health changed');
    },
  });
  healthChecker.start();

  // Initialize performance monitor
  perfMonitor = new PerformanceMonitor(adapter, {
    slowQueryThreshold: config.DB_QUERY_TIMEOUT * 0.8,
    maxTraces: 10_000,
    enabled: config.NODE_ENV !== 'test',
  });

  perfMonitor.on('slowQuery', ({ query, duration }: { query: string; duration: number }) => {
    logger.warn({ duration, query: query.substring(0, 200) }, 'Slow query detected');
  });

  return adapter;
}

/**
 * Get database adapter
 */
export async function getAdapter(): Promise<MySQLAdapter> {
  if (!adapter) {
    return initializeDatabase();
  }
  return adapter;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  healthChecker?.stop();
  healthChecker = null;

  perfMonitor?.disable();
  perfMonitor = null;

  if (adapter) {
    await adapter.disconnect();
    adapter = null;
    logger.info('Database connection closed');
  }
}

// ============================================
// Query Methods with Caching
// ============================================

interface CacheOptions {
  ttl?: number;
  key?: string;
}

/**
 * Execute SELECT query with optional caching
 */
export async function query<T = unknown>(
  sql: string,
  params?: QueryParams,
  cache?: boolean | CacheOptions
): Promise<T[]> {
  const db = await getAdapter();
  const redis = getRedisAdapter();

  // Generate cache key
  const cacheKey =
    cache && typeof cache === 'object' && cache.key ? cache.key : `query:${hashQuery(sql, params)}`;

  // Try cache first
  if (cache && redis) {
    try {
      const cached = await redis.get<T[]>(cacheKey);
      if (cached) {
        cacheStats.hits++;
        logger.debug({ key: cacheKey }, 'Cache HIT');
        return cached;
      }
      cacheStats.misses++;
      logger.debug({ key: cacheKey }, 'Cache MISS');
    } catch (err) {
      logger.warn({ err }, 'Cache read error');
    }
  }

  // Execute query
  const result = await db.query<T>(sql, params);

  // Store in cache
  if (cache && redis && result.rows.length > 0) {
    const ttl = typeof cache === 'object' ? cache.ttl : 300;
    try {
      await redis.set(cacheKey, result.rows, ttl);
    } catch (err) {
      logger.warn({ err }, 'Cache write error');
    }
  }

  return result.rows;
}

/**
 * Execute INSERT/UPDATE/DELETE
 */
export async function execute(
  sql: string,
  params?: QueryParams
): Promise<{ affectedRows: number; insertId: number }> {
  const db = await getAdapter();
  const result = await db.query(sql, params);
  return {
    affectedRows: result.affectedRows ?? 0,
    insertId: result.insertId ?? 0,
  };
}

/**
 * Create QueryBuilder for fluent queries
 */
export async function table<T = unknown>(tableName: string): Promise<QueryBuilder<T>> {
  const db = await getAdapter();
  return db.createQueryBuilder<T>().table(tableName);
}

// ============================================
// Transactions
// ============================================

export interface TransactionContext {
  query: <T = unknown>(sql: string, params?: QueryParams) => Promise<T[]>;
  execute: (
    sql: string,
    params?: QueryParams
  ) => Promise<{ affectedRows: number; insertId: number }>;
}

/**
 * Run operations in a transaction
 */
export async function runInTransaction<T>(
  callback: (tx: TransactionContext) => Promise<T>
): Promise<T> {
  const db = await getAdapter();
  const transaction = await db.beginTransaction();

  try {
    const context: TransactionContext = {
      query: async <R = unknown>(sql: string, params?: QueryParams): Promise<R[]> => {
        const result = await transaction.query<R>(sql, params);
        return result.rows;
      },
      execute: async (sql: string, params?: QueryParams) => {
        const result = await transaction.execute(sql, params);
        return {
          affectedRows: result.affectedRows ?? 0,
          insertId: result.insertId ?? 0,
        };
      },
    };

    const result = await callback(context);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ============================================
// Cache Management
// ============================================

/**
 * Invalidate cache by pattern
 */
export async function invalidateCache(pattern: string): Promise<number> {
  const redis = getRedisAdapter();
  if (!redis) {
    return 0;
  }

  const keys = await redis.keys(pattern);
  if (keys.length === 0) {
    return 0;
  }
  return redis.mdel(keys);
}

/**
 * Clear query cache
 */
export async function clearQueryCache(): Promise<void> {
  await invalidateCache('query:*');
}

// ============================================
// Health & Performance
// ============================================

/**
 * Get database health status
 */
export async function getDatabaseHealth(): Promise<HealthCheckResult | null> {
  return healthChecker?.check() ?? null;
}

/**
 * Check if database is healthy
 */
export function isDatabaseHealthy(): boolean {
  return healthChecker?.isHealthy() ?? false;
}

interface SlowQuery {
  query: string;
  duration: number;
  timestamp: Date;
}

/**
 * Get slow queries
 */
export function getSlowQueries(limit = 20): SlowQuery[] {
  if (!perfMonitor) {
    return [];
  }
  return (perfMonitor.getSlowQueries(limit) as SlowQuery[]) ?? [];
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
} | null {
  const redis = getRedisAdapter();
  if (!redis) {
    return null;
  }

  const total = cacheStats.hits + cacheStats.misses;
  return {
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    hitRate: total > 0 ? cacheStats.hits / total : 0,
    size: 0, // Size tracking would require additional Redis calls
  };
}

/**
 * Reset cache statistics
 */
export function resetCacheStats(): void {
  cacheStats.hits = 0;
  cacheStats.misses = 0;
}

interface PerformanceBottleneck {
  operation: string;
  averageDuration: number;
  count: number;
}

interface PerformanceReport {
  slowQueries: SlowQuery[];
  bottlenecks: PerformanceBottleneck[];
  recommendations: string[];
}

/**
 * Get performance report
 */
export async function getPerformanceReport(
  timeRangeMs = 3_600_000
): Promise<PerformanceReport | null> {
  return perfMonitor?.analyzePerformance(timeRangeMs) ?? null;
}

// ============================================
// Utilities
// ============================================

function hashQuery(sql: string, params?: QueryParams): string {
  const str = sql + JSON.stringify(params ?? []);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ============================================
// Exports
// ============================================

export { MySQLAdapter };
export type { Transaction, QueryBuilder, HealthCheckResult, QueryParams };
