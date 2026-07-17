import type { TransactionContext } from './database.js';
import { runInTransaction } from './database.js';
import { cacheDelPattern } from '../redis/redis.js';
import logger from '../logger/logger.js';

export interface ExecuteResult {
  insertId: number;
  affectedRows: number;
}

export interface TransactionOptions {
  invalidateCachePatterns?: string | string[];
}

export class TransactionManager {
  async runInTransaction<T>(
    callback: (tx: TransactionContext) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    try {
      const result = await runInTransaction(callback);

      if (options?.invalidateCachePatterns) {
        await this.invalidateCachePatterns(options.invalidateCachePatterns);
      }

      return result;
    } catch (error) {
      logger.error({ err: error }, 'Transaction failed, rolling back');
      throw error;
    }
  }

  async invalidateCache(pattern: string): Promise<void> {
    try {
      // SCAN + UNLINK under the hood; pattern is relative to the service key prefix
      await cacheDelPattern(pattern);
    } catch (error) {
      logger.warn({ err: error, pattern }, 'Failed to invalidate cache');
    }
  }

  async invalidateCachePatterns(patterns: string | string[]): Promise<void> {
    const patternArray = Array.isArray(patterns) ? patterns : [patterns];
    await Promise.all(patternArray.map((pattern) => this.invalidateCache(pattern)));
  }
}

export const transactionManager = new TransactionManager();
export type { TransactionContext };
