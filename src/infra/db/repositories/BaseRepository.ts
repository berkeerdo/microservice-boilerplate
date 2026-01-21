import { query, execute, runInTransaction } from '../database.js';
import type { TransactionContext } from '../database.js';
import type { QueryParams } from '@db-bridge/core';
import { getRedisClient } from '../../redis/redis.js';
import logger from '../../logger/logger.js';
import { CacheKeyGenerator } from '../cache/cacheKeyGenerator.js';
import config from '../../../config/env.js';

const SLOW_QUERY_THRESHOLD_RATIO = 0.8;
const DEFAULT_CACHE_TTL = 300; // 5 minutes

export class QueryTimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = 'QueryTimeoutError';
  }
}

interface TimedResult<T> {
  result: T;
  durationMs: number;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<TimedResult<T>> {
  let timeoutId: NodeJS.Timeout;
  const startTime = Date.now();

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new QueryTimeoutError(errorMessage, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return {
      result,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

export interface CursorPaginationResult<T> {
  data: T[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface MysqlResult {
  affectedRows: number;
  insertId: number;
  changedRows?: number;
}

export type { IRepository } from '../../../domain/repositories/index.js';

export abstract class BaseRepository<T> {
  constructor(
    protected tableName: string,
    protected cachePrefix: string
  ) {}

  protected async query<R = T>(
    sql: string,
    params: QueryParams = [],
    cacheName?: string,
    timeoutMs?: number
  ): Promise<R[]> {
    const timeout = timeoutMs ?? config.DB_QUERY_TIMEOUT;
    const cacheKey = cacheName || CacheKeyGenerator.generate(this.cachePrefix, sql, params);
    const redis = getRedisClient();

    try {
      // Try to get from cache first
      if (redis) {
        try {
          const cached = await redis.get(cacheKey);
          if (cached) {
            return JSON.parse(cached) as R[];
          }
        } catch (cacheError) {
          logger.warn({ err: cacheError }, 'Cache read error, falling back to database');
        }
      }

      // Execute query with timeout
      const queryPromise = query<R>(sql, params);
      const { result, durationMs } = await withTimeout(
        queryPromise,
        timeout,
        `Query timeout after ${timeout}ms: ${sql.substring(0, 100)}...`
      );

      // Warn if query is slow
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
          `Slow query detected in ${this.tableName}`
        );
      }

      // Store in cache
      if (redis) {
        try {
          await redis.setex(cacheKey, DEFAULT_CACHE_TTL, JSON.stringify(result));
        } catch (cacheError) {
          logger.warn({ err: cacheError }, 'Cache write error');
        }
      }

      return result;
    } catch (error) {
      if (error instanceof QueryTimeoutError) {
        logger.error(
          { sql: sql.substring(0, 200), timeoutMs: timeout },
          `Query timeout in ${this.tableName}`
        );
      } else {
        logger.error({ err: error, sql }, `Query failed in ${this.tableName}`);
      }
      throw error;
    }
  }

  protected async execute(
    sql: string,
    params: QueryParams = [],
    resetCacheName?: string,
    timeoutMs?: number
  ): Promise<MysqlResult> {
    const timeout = timeoutMs ?? config.DB_QUERY_TIMEOUT;

    try {
      const executePromise = execute(sql, params);
      const { result, durationMs } = await withTimeout(
        executePromise,
        timeout,
        `Execute timeout after ${timeout}ms: ${sql.substring(0, 100)}...`
      );

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
          `Slow execute detected in ${this.tableName}`
        );
      }

      // Invalidate cache
      const cachePattern =
        resetCacheName || CacheKeyGenerator.invalidationPattern(this.cachePrefix);
      await this.invalidateCache(cachePattern);

      return result;
    } catch (error) {
      if (error instanceof QueryTimeoutError) {
        logger.error(
          { sql: sql.substring(0, 200), timeoutMs: timeout },
          `Execute timeout in ${this.tableName}`
        );
      } else {
        logger.error({ err: error, sql }, `Execute failed in ${this.tableName}`);
      }
      throw error;
    }
  }

  protected async transaction<R>(callback: (tx: TransactionContext) => Promise<R>): Promise<R> {
    try {
      return await runInTransaction(callback);
    } catch (error) {
      logger.error({ err: error }, `Transaction failed in ${this.tableName}`);
      throw error;
    }
  }

  protected async invalidateCache(pattern: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis) {
      return;
    }

    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      logger.warn({ err: error, pattern }, 'Failed to invalidate cache');
    }
  }

  async findById(id: number): Promise<T | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ? LIMIT 1`;
    const results = await this.query(sql, [id], CacheKeyGenerator.forId(this.cachePrefix, id));
    return results[0] || null;
  }

  async findAll(limit = 100, offset = 0): Promise<T[]> {
    const sql = `SELECT * FROM ${this.tableName} LIMIT ? OFFSET ?`;
    return this.query(
      sql,
      [limit, offset],
      CacheKeyGenerator.forList(this.cachePrefix, limit, offset)
    );
  }

  async delete(id: number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.execute(sql, [id]);
    return result.affectedRows > 0;
  }

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
}
