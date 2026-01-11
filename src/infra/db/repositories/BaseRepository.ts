import dbConnector from 'node-caching-mysql-connector-with-redis';

const { getCacheQuery, QuaryCache, withTransaction } = dbConnector;
import logger from '../../logger/logger.js';
import { CacheKeyGenerator } from '../cache/cacheKeyGenerator.js';
import config from '../../../config/env.js';

/**
 * Slow query threshold - warn when query takes > 80% of timeout
 */
const SLOW_QUERY_THRESHOLD_RATIO = 0.8;

/**
 * Query timeout error
 */
export class QueryTimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Result with timing information
 */
interface TimedResult<T> {
  result: T;
  durationMs: number;
}

/**
 * Wrap a promise with a timeout and return duration
 */
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

/**
 * Cursor-based pagination result
 */
export interface CursorPaginationResult<T> {
  data: T[];
  hasMore: boolean;
  nextCursor?: string;
}

/**
 * MySQL Result interface
 */
export interface MysqlResult {
  affectedRows: number;
  insertId: number;
  changedRows: number;
}

// Re-export from domain for backwards compatibility
export type { IRepository } from '../../../domain/repositories/index.js';

/**
 * Base repository abstract class
 * Provides common database operations with automatic caching
 */
export abstract class BaseRepository<T> {
  constructor(
    protected tableName: string,
    protected cachePrefix: string
  ) {}

  /**
   * Execute a cached SELECT query with timeout protection
   * If cacheName is not provided, generates a unique key from SQL + params
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

      // Warn if query is approaching timeout threshold
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

  /**
   * Execute a write query (INSERT, UPDATE, DELETE) with timeout protection
   * Auto-invalidates cache using table name pattern
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

      // Warn if query is approaching timeout threshold
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

  /**
   * Find entity by ID
   */
  async findById(id: number): Promise<T | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ? LIMIT 1`;
    const results = await this.query(sql, [id], CacheKeyGenerator.forId(this.cachePrefix, id));
    return results[0] || null;
  }

  /**
   * Find all entities with pagination
   */
  async findAll(limit = 100, offset = 0): Promise<T[]> {
    const sql = `SELECT * FROM ${this.tableName} LIMIT ? OFFSET ?`;
    return this.query(
      sql,
      [limit, offset],
      CacheKeyGenerator.forList(this.cachePrefix, limit, offset)
    );
  }

  /**
   * Delete entity by ID
   */
  async delete(id: number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.execute(sql, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Find all entities with cursor-based pagination
   * More efficient than offset pagination for large datasets
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
}
