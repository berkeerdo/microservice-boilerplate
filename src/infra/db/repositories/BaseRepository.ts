import dbConnector from 'node-caching-mysql-connector-with-redis';

const { getCacheQuery, QuaryCache, withTransaction } = dbConnector;
import logger from '../../logger/logger.js';
import { CacheKeyGenerator } from '../cache/cacheKeyGenerator.js';
import config from '../../../config/env.js';
import { QueryTimeoutError, withTimeout } from './utils/queryTimeout.js';
import {
  type MysqlResult,
  type CursorPaginationResult,
  SLOW_QUERY_THRESHOLD_RATIO,
} from './types/repository.js';
import { SoftDeleteMixin } from './mixins/SoftDeleteMixin.js';

// Re-export for backwards compatibility
export { QueryTimeoutError } from './utils/queryTimeout.js';
export type { MysqlResult, CursorPaginationResult } from './types/repository.js';
export type { IRepository } from '../../../domain/repositories/index.js';

/**
 * Redis client interface for type-safe cache operations
 */
interface RedisClient {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  del(...keys: string[]): Promise<void>;
}

/**
 * Get Redis client for cache operations
 */
function getRedisClientInstance(): RedisClient | null {
  return dbConnector.getRedisClient() as RedisClient | null;
}

/**
 * Base repository abstract class
 * Provides common database operations with automatic caching
 */
export abstract class BaseRepository<T> {
  /**
   * Whether this repository supports soft delete
   * Override in child class to enable soft delete
   */
  protected supportsSoftDelete = false;

  /**
   * Soft delete helper - initialized when supportsSoftDelete is true
   */
  private _softDeleteMixin?: SoftDeleteMixin;

  constructor(
    protected tableName: string,
    protected cachePrefix: string
  ) {}

  /**
   * Get soft delete mixin (lazy initialization)
   */
  protected get softDeleteMixin(): SoftDeleteMixin {
    if (!this._softDeleteMixin) {
      this._softDeleteMixin = new SoftDeleteMixin(
        {
          execute: this.execute.bind(this),
          query: this.query.bind(this),
        },
        {
          tableName: this.tableName,
          cachePrefix: this.cachePrefix,
        }
      );
    }
    return this._softDeleteMixin;
  }

  // ============================================
  // REDIS CACHE HELPERS
  // ============================================

  /**
   * Get a cached value or compute and cache it
   * Uses the node-caching-mysql-connector-with-redis Redis client
   */
  protected async getCached<R>(cacheKey: string, compute: () => Promise<R>): Promise<R | null> {
    const redis = getRedisClientInstance();
    if (!redis) {
      return compute();
    }

    try {
      const fullKey = CacheKeyGenerator.forCustom(this.cachePrefix, cacheKey);
      const cached = await redis.get(fullKey);
      if (cached) {
        return JSON.parse(cached) as R;
      }

      const result = await compute();
      if (result !== null && result !== undefined) {
        await redis.setex(fullKey, 3600, JSON.stringify(result)); // 1 hour cache
      }
      return result;
    } catch (error) {
      logger.warn({ err: error, cacheKey }, 'Cache operation failed, falling back to compute');
      return compute();
    }
  }

  /**
   * Clear cache entries matching a pattern
   */
  protected async clearCachePattern(pattern: string): Promise<void> {
    const redis = getRedisClientInstance();
    if (!redis) {
      return;
    }

    try {
      const fullPattern = CacheKeyGenerator.forCustom(this.cachePrefix, pattern);
      const keys = await redis.keys(`${fullPattern}*`);
      if (keys && keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      logger.warn({ err: error, pattern }, 'Cache clear failed');
    }
  }

  // ============================================
  // CORE QUERY METHODS
  // ============================================

  /**
   * Execute a cached SELECT query with timeout protection
   */
  protected async query<R = T>(
    sql: string,
    params: unknown[] = [],
    cacheName?: string,
    timeoutMs?: number
  ): Promise<R[]> {
    const timeout = timeoutMs ?? config.DB_QUERY_TIMEOUT;

    try {
      const cacheKey = cacheName || CacheKeyGenerator.generate(this.cachePrefix, sql, params);

      const queryPromise = (
        getCacheQuery as (sql: string, params: unknown[], key: string) => Promise<R[]>
      )(sql, params, cacheKey);

      const { result, durationMs } = await withTimeout(
        queryPromise,
        timeout,
        `Query timeout after ${timeout}ms: ${sql.substring(0, 100)}...`
      );

      this.warnIfSlow(durationMs, timeout, sql, 'query');
      return result;
    } catch (error) {
      this.logQueryError(error, sql, timeout);
      throw error;
    }
  }

  /**
   * Execute a write query (INSERT, UPDATE, DELETE) with timeout protection
   */
  protected async execute(
    sql: string,
    params: unknown[] = [],
    resetCacheName?: string,
    timeoutMs?: number
  ): Promise<MysqlResult> {
    const timeout = timeoutMs ?? config.DB_QUERY_TIMEOUT;

    try {
      const cachePattern =
        resetCacheName || CacheKeyGenerator.invalidationPattern(this.cachePrefix);

      const executePromise = (
        QuaryCache as (sql: string, params: unknown[], pattern: string) => Promise<MysqlResult>
      )(sql, params, cachePattern);

      const { result, durationMs } = await withTimeout(
        executePromise,
        timeout,
        `Execute timeout after ${timeout}ms: ${sql.substring(0, 100)}...`
      );

      this.warnIfSlow(durationMs, timeout, sql, 'execute');
      return result;
    } catch (error) {
      this.logQueryError(error, sql, timeout);
      throw error;
    }
  }

  /**
   * Execute within a transaction
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async transaction<R>(callback: (tx: any) => Promise<R>): Promise<R> {
    try {
      return await (withTransaction as <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>)(
        callback
      );
    } catch (error) {
      logger.error({ err: error }, `Transaction failed in ${this.tableName}`);
      throw error;
    }
  }

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  /**
   * Find entity by ID (excludes soft deleted by default)
   */
  async findById(id: number, includeDeleted = false): Promise<T | null> {
    const deletedCondition =
      this.supportsSoftDelete && !includeDeleted
        ? ` AND ${SoftDeleteMixin.excludeDeletedCondition()}`
        : '';
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?${deletedCondition} LIMIT 1`;
    const results = await this.query(sql, [id], CacheKeyGenerator.forId(this.cachePrefix, id));
    return results[0] || null;
  }

  /**
   * Find all entities with pagination (excludes soft deleted by default)
   */
  async findAll(limit = 100, offset = 0, includeDeleted = false): Promise<T[]> {
    const deletedCondition =
      this.supportsSoftDelete && !includeDeleted
        ? ` WHERE ${SoftDeleteMixin.excludeDeletedCondition()}`
        : '';
    const sql = `SELECT * FROM ${this.tableName}${deletedCondition} LIMIT ? OFFSET ?`;
    return this.query(
      sql,
      [limit, offset],
      CacheKeyGenerator.forList(this.cachePrefix, limit, offset)
    );
  }

  /**
   * Delete entity by ID (uses soft delete if supported)
   */
  async delete(id: number, deletedBy?: number): Promise<boolean> {
    if (this.supportsSoftDelete) {
      return this.softDeleteMixin.softDelete(id, deletedBy);
    }
    // Fallback to hard delete only for tables without soft delete support
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.execute(sql, [id]);
    return result.affectedRows > 0;
  }

  // ============================================
  // SOFT DELETE OPERATIONS (delegated to mixin)
  // ============================================

  /**
   * Soft delete entity by ID
   */
  async softDelete(id: number, deletedBy?: number): Promise<boolean> {
    if (!this.supportsSoftDelete) {
      logger.warn({ table: this.tableName, id }, 'Soft delete not supported, using hard delete');
      return this.delete(id);
    }
    return this.softDeleteMixin.softDelete(id, deletedBy);
  }

  /**
   * Restore a soft deleted entity
   */
  async restore(id: number): Promise<boolean> {
    if (!this.supportsSoftDelete) {
      logger.warn({ table: this.tableName, id }, 'Restore not supported - soft delete disabled');
      return false;
    }
    return this.softDeleteMixin.restore(id);
  }

  /**
   * Permanent delete - ONLY for scheduled cleanup after grace period
   * @internal Use only in PermanentDeleteWorker
   */
  async permanentDelete(id: number): Promise<boolean> {
    return this.softDeleteMixin.permanentDelete(id);
  }

  /**
   * Find only soft deleted entities
   */
  async findDeleted(limit = 100, offset = 0): Promise<T[]> {
    if (!this.supportsSoftDelete) {
      return [];
    }
    return this.softDeleteMixin.findDeleted<T>(limit, offset);
  }

  /**
   * Find soft deleted entities older than specified days (for cleanup)
   */
  async findDeletedOlderThan(days: number, limit = 100): Promise<T[]> {
    if (!this.supportsSoftDelete) {
      return [];
    }
    return this.softDeleteMixin.findDeletedOlderThan<T>(days, limit);
  }

  // ============================================
  // CURSOR PAGINATION
  // ============================================

  /**
   * Find all entities with cursor-based pagination
   */
  async findAllCursor(
    limit = 100,
    cursor?: string,
    orderDirection: 'ASC' | 'DESC' = 'ASC'
  ): Promise<CursorPaginationResult<T>> {
    const operator = orderDirection === 'ASC' ? '>' : '<';
    const cursorCondition = cursor ? `WHERE id ${operator} ?` : '';
    const params = cursor ? [cursor, limit + 1] : [limit + 1];

    const sql = `SELECT * FROM ${this.tableName} ${cursorCondition} ORDER BY id ${orderDirection} LIMIT ?`;

    const results = await this.query(
      sql,
      params,
      CacheKeyGenerator.forCursor(this.cachePrefix, limit, cursor, orderDirection)
    );

    return this.createCursorResult(results as (T & { id?: number })[], limit);
  }

  /**
   * Create cursor pagination result from query results
   */
  protected createCursorResult<R extends { id?: number }>(
    results: R[],
    limit: number
  ): CursorPaginationResult<R> {
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;
    const lastItem = data[data.length - 1];

    return {
      data,
      hasMore,
      nextCursor: hasMore && lastItem?.id ? String(lastItem.id) : undefined,
    };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private warnIfSlow(durationMs: number, timeout: number, sql: string, operation: string): void {
    const slowThreshold = timeout * SLOW_QUERY_THRESHOLD_RATIO;
    if (durationMs > slowThreshold) {
      logger.warn(
        {
          table: this.tableName,
          durationMs,
          thresholdMs: slowThreshold,
          timeoutMs: timeout,
          sql: sql.substring(0, 100),
        },
        `Slow ${operation} detected in ${this.tableName}`
      );
    }
  }

  private logQueryError(error: unknown, sql: string, timeout: number): void {
    if (error instanceof QueryTimeoutError) {
      logger.error(
        { sql: sql.substring(0, 200), timeoutMs: timeout },
        `Query timeout in ${this.tableName}`
      );
    } else {
      logger.error({ err: error, sql }, `Query failed in ${this.tableName}`);
    }
  }
}
