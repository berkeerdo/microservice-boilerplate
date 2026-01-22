/**
 * Repository types and interfaces
 */

/**
 * Cursor-based pagination result
 */
export interface CursorPaginationResult<T> {
  data: T[];
  hasMore: boolean;
  nextCursor?: string;
}

/**
 * MySQL Result interface for write operations
 */
export interface MysqlResult {
  affectedRows: number;
  insertId: number;
  changedRows: number;
}

/**
 * Slow query threshold - warn when query takes > 80% of timeout
 */
export const SLOW_QUERY_THRESHOLD_RATIO = 0.8;

// Re-export from domain for backwards compatibility
export type { IRepository } from '../../../../domain/repositories/index.js';
