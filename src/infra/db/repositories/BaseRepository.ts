import { query, execute, runInTransaction, table, invalidateCache } from '../database.js';
import type { TransactionContext, QueryBuilder } from '../database.js';
import type { QueryParams } from '@db-bridge/core';
import logger from '../../logger/logger.js';

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

/**
 * Base Repository with built-in caching via db-bridge CachedDBBridge
 *
 * Features:
 * - Automatic query caching with $withCache()
 * - Auto-invalidation on mutations
 * - Tag-based cache invalidation
 * - Cursor-based pagination
 * - Transaction support
 *
 * @example
 * class UserRepository extends BaseRepository<User> {
 *   constructor() {
 *     super('users', 'user');
 *   }
 *
 *   async findByEmail(email: string): Promise<User | null> {
 *     const results = await this.query(
 *       'SELECT * FROM users WHERE email = ? LIMIT 1',
 *       [email],
 *       { cache: { ttl: 300, tags: ['users'] } }
 *     );
 *     return results[0] || null;
 *   }
 * }
 */
export abstract class BaseRepository<T> {
  constructor(
    protected tableName: string,
    protected cachePrefix: string
  ) {}

  /**
   * Execute SELECT query with optional caching
   *
   * @example
   * // Without cache
   * const users = await this.query('SELECT * FROM users');
   *
   * // With cache (default TTL)
   * const users = await this.query('SELECT * FROM users', [], { cache: true });
   *
   * // With custom cache options
   * const users = await this.query('SELECT * FROM users WHERE active = ?', [true], {
   *   cache: { ttl: 600, tags: ['users', 'active-users'] }
   * });
   */
  protected async query<R = T>(
    sql: string,
    params: QueryParams = [],
    options?: { cache?: boolean | { ttl?: number; key?: string } }
  ): Promise<R[]> {
    try {
      return await query<R>(sql, params, options?.cache);
    } catch (error) {
      logger.error(
        { err: error, sql: sql.substring(0, 100), table: this.tableName },
        'Query failed'
      );
      throw error;
    }
  }

  /**
   * Execute INSERT/UPDATE/DELETE
   * Automatically invalidates related cache via db-bridge autoInvalidate
   */
  protected async execute(sql: string, params: QueryParams = []): Promise<MysqlResult> {
    try {
      return await execute(sql, params);
    } catch (error) {
      logger.error(
        { err: error, sql: sql.substring(0, 100), table: this.tableName },
        'Execute failed'
      );
      throw error;
    }
  }

  /**
   * Run operations in a transaction
   */
  protected async transaction<R>(callback: (tx: TransactionContext) => Promise<R>): Promise<R> {
    try {
      return await runInTransaction(callback);
    } catch (error) {
      logger.error({ err: error, table: this.tableName }, 'Transaction failed');
      throw error;
    }
  }

  /**
   * Invalidate cache by pattern
   * Use this for custom invalidation patterns
   */
  protected async invalidateCachePattern(pattern: string): Promise<number> {
    return invalidateCache(pattern);
  }

  /**
   * Invalidate all cache for this entity type
   */
  protected async invalidateEntityCache(): Promise<number> {
    return invalidateCache(`${this.cachePrefix}:*`);
  }

  // ============================================
  // Common CRUD Operations
  // ============================================

  /**
   * Find by ID with caching
   */
  async findById(id: number): Promise<T | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ? LIMIT 1`;
    const results = await this.query(sql, [id], {
      cache: { ttl: 300, key: `${this.cachePrefix}:${id}` },
    });
    return results[0] || null;
  }

  /**
   * Find all with pagination and caching
   */
  async findAll(limit = 100, offset = 0): Promise<T[]> {
    const sql = `SELECT * FROM ${this.tableName} LIMIT ? OFFSET ?`;
    return this.query(sql, [limit, offset], {
      cache: { ttl: 60, key: `${this.cachePrefix}:list:${limit}:${offset}` },
    });
  }

  /**
   * Delete by ID
   * Cache is auto-invalidated by db-bridge
   */
  async delete(id: number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.execute(sql, [id]);

    // Invalidate entity cache
    await this.invalidateCachePattern(`${this.cachePrefix}:*`);

    return result.affectedRows > 0;
  }

  /**
   * Count all records
   */
  async count(): Promise<number> {
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const results = await this.query<{ count: number }>(sql, [], {
      cache: { ttl: 60, key: `${this.cachePrefix}:count` },
    });
    return results[0]?.count || 0;
  }

  /**
   * Check if entity exists
   */
  async exists(id: number): Promise<boolean> {
    const sql = `SELECT 1 FROM ${this.tableName} WHERE id = ? LIMIT 1`;
    const results = await this.query<{ 1: number }>(sql, [id], {
      cache: { ttl: 300, key: `${this.cachePrefix}:exists:${id}` },
    });
    return results.length > 0;
  }

  // ============================================
  // Cursor-based Pagination
  // ============================================

  /**
   * Find all with cursor-based pagination
   * More efficient than offset pagination for large datasets
   *
   * @example
   * // First page
   * const page1 = await repo.findAllCursor(20);
   *
   * // Next page
   * const page2 = await repo.findAllCursor(20, page1.nextCursor);
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

    const cursorKey = cursor ? `:${cursor}` : '';
    const results = await this.query(sql, params, {
      cache: { ttl: 30, key: `${this.cachePrefix}:cursor:${limit}:${orderDirection}${cursorKey}` },
    });

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

  // ============================================
  // Query Builder Helper
  // ============================================

  /**
   * Get fluent query builder for this table
   *
   * @example
   * const users = await this.queryBuilder()
   *   .select('id', 'name', 'email')
   *   .where('active', '=', true)
   *   .orderBy('created_at', 'DESC')
   *   .$withCache({ ttl: 300 })
   *   .get();
   */
  protected queryBuilder(): Promise<QueryBuilder<T>> {
    return table<T>(this.tableName);
  }
}
