/**
 * Soft Delete Mixin
 * Provides soft delete functionality for repositories
 */

import logger from '../../../logger/logger.js';
import { CacheKeyGenerator } from '../../cache/cacheKeyGenerator.js';
import type { MysqlResult } from '../types/repository.js';

/**
 * Executor interface for soft delete operations
 */
export interface SoftDeleteExecutor {
  execute(sql: string, params: unknown[], resetCacheName?: string): Promise<MysqlResult>;
  query<R>(sql: string, params: unknown[], cacheName?: string): Promise<R[]>;
}

/**
 * Options for soft delete mixin
 */
export interface SoftDeleteOptions {
  tableName: string;
  cachePrefix: string;
}

/**
 * Soft Delete Mixin class
 * Provides soft delete operations using composition pattern
 */
export class SoftDeleteMixin {
  constructor(
    private executor: SoftDeleteExecutor,
    private options: SoftDeleteOptions
  ) {}

  /**
   * Soft delete an entity by ID
   * Sets deleted_at timestamp instead of removing
   */
  async softDelete(id: number | string, deletedBy?: number): Promise<boolean> {
    const sql = `
      UPDATE ${this.options.tableName}
      SET deleted_at = NOW(), deleted_by = ?
      WHERE id = ? AND deleted_at IS NULL
    `;
    const result = await this.executor.execute(sql, [deletedBy ?? null, id]);

    if (result.affectedRows > 0) {
      logger.info({ table: this.options.tableName, id, deletedBy }, 'Entity soft deleted');
    }

    return result.affectedRows > 0;
  }

  /**
   * Restore a soft deleted entity
   */
  async restore(id: number | string): Promise<boolean> {
    const sql = `
      UPDATE ${this.options.tableName}
      SET deleted_at = NULL, deleted_by = NULL
      WHERE id = ? AND deleted_at IS NOT NULL
    `;
    const result = await this.executor.execute(sql, [id]);

    if (result.affectedRows > 0) {
      logger.info({ table: this.options.tableName, id }, 'Entity restored from soft delete');
    }

    return result.affectedRows > 0;
  }

  /**
   * Permanently delete an entity
   * @internal Use only in scheduled cleanup workers after grace period
   */
  async permanentDelete(id: number | string): Promise<boolean> {
    const sql = `DELETE FROM ${this.options.tableName} WHERE id = ?`;
    const result = await this.executor.execute(sql, [id]);

    if (result.affectedRows > 0) {
      logger.warn({ table: this.options.tableName, id }, 'Entity permanently deleted');
    }

    return result.affectedRows > 0;
  }

  /**
   * Find only soft deleted entities
   */
  async findDeleted<T>(limit = 100, offset = 0): Promise<T[]> {
    const sql = `
      SELECT * FROM ${this.options.tableName}
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
      LIMIT ? OFFSET ?
    `;
    return this.executor.query<T>(
      sql,
      [limit, offset],
      CacheKeyGenerator.forCustom(this.options.cachePrefix, `deleted:${limit}:${offset}`)
    );
  }

  /**
   * Find soft deleted entities older than specified days
   * Used for scheduled permanent deletion after grace period
   */
  async findDeletedOlderThan<T>(days: number, limit = 100): Promise<T[]> {
    const sql = `
      SELECT * FROM ${this.options.tableName}
      WHERE deleted_at IS NOT NULL
        AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY deleted_at ASC
      LIMIT ?
    `;
    return this.executor.query<T>(
      sql,
      [days, limit],
      CacheKeyGenerator.forCustom(this.options.cachePrefix, `deleted_older:${days}:${limit}`)
    );
  }

  /**
   * Get SQL condition to exclude soft deleted records
   * @param alias - Optional table alias for joins
   */
  static excludeDeletedCondition(alias?: string): string {
    const prefix = alias ? `${alias}.` : '';
    return `${prefix}deleted_at IS NULL`;
  }
}
