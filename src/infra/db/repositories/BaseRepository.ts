import dbConnector from 'node-caching-mysql-connector-with-redis';

const { getCacheQuery, QuaryCache, withTransaction } = dbConnector;
import logger from '../../logger/logger.js';
import { CacheKeyGenerator } from '../cache/cacheKeyGenerator.js';

/**
 * MySQL Result interface
 */
export interface MysqlResult {
  affectedRows: number;
  insertId: number;
  changedRows: number;
}

/**
 * Base repository interface
 */
export interface IRepository<T> {
  findById(id: number): Promise<T | null>;
  findAll(limit?: number, offset?: number): Promise<T[]>;
  create(entity: Partial<T>): Promise<number>;
  update(id: number, entity: Partial<T>): Promise<boolean>;
  delete(id: number): Promise<boolean>;
}

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
   * Execute a cached SELECT query
   * If cacheName is not provided, generates a unique key from SQL + params
   */
  protected async query<R = T>(
    sql: string,
    params: unknown[] = [],
    cacheName?: string
  ): Promise<R[]> {
    try {
      const cacheKey = cacheName || CacheKeyGenerator.generate(this.cachePrefix, sql, params);

      return await (getCacheQuery as (sql: string, params: unknown[], key: string) => Promise<R[]>)(
        sql,
        params,
        cacheKey
      );
    } catch (error) {
      logger.error({ err: error, sql }, `Query failed in ${this.tableName}`);
      throw error;
    }
  }

  /**
   * Execute a write query (INSERT, UPDATE, DELETE)
   * Auto-invalidates cache using table name pattern
   */
  protected async execute(
    sql: string,
    params: unknown[] = [],
    resetCacheName?: string
  ): Promise<MysqlResult> {
    try {
      const cachePattern =
        resetCacheName || CacheKeyGenerator.invalidationPattern(this.cachePrefix);

      return await (
        QuaryCache as (sql: string, params: unknown[], pattern: string) => Promise<MysqlResult>
      )(sql, params, cachePattern);
    } catch (error) {
      logger.error({ err: error, sql }, `Execute failed in ${this.tableName}`);
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
