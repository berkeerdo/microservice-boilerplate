import dbConnector from 'node-caching-mysql-connector-with-redis';

const { getCacheQuery, QuaryCache, withTransaction } = dbConnector;
import logger from '../../logger/logger.js';
import { CacheKeyGenerator } from '../cache/cacheKeyGenerator.js';
import config from '../../../config/env.js';

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
 * Wrap a promise with a timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new QueryTimeoutError(errorMessage, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
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

      return await withTimeout(
        queryPromise,
        timeout,
        `Query timeout after ${timeout}ms: ${sql.substring(0, 100)}...`
      );
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

      return await withTimeout(
        executePromise,
        timeout,
        `Execute timeout after ${timeout}ms: ${sql.substring(0, 100)}...`
      );
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
    const results = await this.query<T>(sql, [id], CacheKeyGenerator.forId(this.cachePrefix, id));
    return results[0] || null;
  }

  /**
   * Find all entities with pagination
   */
  async findAll(limit = 100, offset = 0): Promise<T[]> {
    const sql = `SELECT * FROM ${this.tableName} LIMIT ? OFFSET ?`;
    return this.query<T>(
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
}
