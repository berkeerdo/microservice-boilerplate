import dbConnector from 'node-caching-mysql-connector-with-redis';
import logger from '../logger/logger.js';

const { withTransaction, QuaryCache } = dbConnector;

/**
 * MySQL execute result type
 */
export interface ExecuteResult {
  insertId: number;
  affectedRows: number;
}

/**
 * Type guard to validate MySQL execute result
 */
function isExecuteResult(value: unknown): value is ExecuteResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'insertId' in value &&
    'affectedRows' in value &&
    typeof (value as ExecuteResult).insertId === 'number' &&
    typeof (value as ExecuteResult).affectedRows === 'number'
  );
}

/**
 * Transaction context for executing queries within a transaction
 */
export interface TransactionContext {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  execute: (sql: string, params?: unknown[]) => Promise<ExecuteResult>;
}

/**
 * Options for transaction execution
 */
export interface TransactionOptions {
  /**
   * Cache patterns to invalidate after successful transaction
   * Examples: ['workspace*', 'team*'] or 'workspace*'
   */
  invalidateCachePatterns?: string | string[];
}

/**
 * Transaction Manager
 * Provides a way to execute multiple database operations within a single transaction
 *
 * Usage:
 * ```typescript
 * // Without cache invalidation
 * const result = await transactionManager.runInTransaction(async (tx) => {
 *   const userId = await tx.execute('INSERT INTO users...', [...]);
 *   await tx.execute('INSERT INTO profiles...', [...]);
 *   return { userId };
 * });
 *
 * // With automatic cache invalidation after commit
 * const result = await transactionManager.runInTransaction(
 *   async (tx) => {
 *     await tx.execute('INSERT INTO items...', [...]);
 *     return { itemId };
 *   },
 *   { invalidateCachePatterns: ['item*', 'inventory*'] }
 * );
 * ```
 */
export class TransactionManager {
  /**
   * Execute a callback function within a database transaction
   * If any operation fails, all changes are rolled back
   *
   * @param callback Function to execute within the transaction
   * @param options Optional settings including cache invalidation patterns
   * @returns The result of the callback function
   * @throws Error if any operation fails (transaction is rolled back)
   */
  async runInTransaction<T>(
    callback: (tx: TransactionContext) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    try {
      // Use the package's withTransaction which handles BEGIN, COMMIT, ROLLBACK
      const result = await (
        withTransaction as <R>(
          cb: (tx: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<R>
        ) => Promise<R>
      )(async (tx) => {
        // Create our transaction context wrapping the package's tx object
        const context: TransactionContext = {
          query: async <R>(sql: string, params: unknown[] = []): Promise<R[]> => {
            const queryResult = await tx.query(sql, params);
            return queryResult as R[];
          },
          execute: async (sql: string, params: unknown[] = []): Promise<ExecuteResult> => {
            // The package's tx.query returns the result directly (mysql2/promise format)
            const executeResult = await tx.query(sql, params);
            if (!isExecuteResult(executeResult)) {
              throw new Error(
                `Invalid execute result: expected {insertId, affectedRows}, got ${JSON.stringify(executeResult)}`
              );
            }
            return executeResult;
          },
        };

        return callback(context);
      });

      // Invalidate cache after successful transaction (commit happened)
      if (options?.invalidateCachePatterns) {
        await this.invalidateCachePatterns(options.invalidateCachePatterns);
      }

      return result;
    } catch (error) {
      logger.error({ err: error }, 'Transaction failed, rolling back');
      throw error;
    }
  }

  /**
   * Invalidate cache for a specific table/pattern after successful transaction
   * Call this after runInTransaction if you modified data
   *
   * @param pattern Cache pattern to invalidate (e.g., 'user:*', 'item:*')
   */
  async invalidateCache(pattern: string): Promise<void> {
    try {
      // Use QuaryCache with a no-op query to trigger cache invalidation
      await (QuaryCache as (sql: string, params: unknown[], pattern: string) => Promise<unknown>)(
        'SELECT 1',
        [],
        pattern
      );
    } catch (error) {
      logger.warn({ err: error, pattern }, 'Failed to invalidate cache');
    }
  }

  /**
   * Invalidate multiple cache patterns in parallel
   *
   * @param patterns Single pattern or array of patterns to invalidate
   */
  async invalidateCachePatterns(patterns: string | string[]): Promise<void> {
    const patternArray = Array.isArray(patterns) ? patterns : [patterns];
    await Promise.all(patternArray.map((pattern) => this.invalidateCache(pattern)));
  }
}

// Export singleton instance for direct use
export const transactionManager = new TransactionManager();
