import { MySQLAdapter } from '@db-bridge/mysql';
import type { Transaction, QueryResult, ConnectionConfig, QueryBuilder } from '@db-bridge/mysql';
import type { QueryParams } from '@db-bridge/core';
import config from '../../config/env.js';
import logger from '../logger/logger.js';

let adapter: MySQLAdapter | null = null;

export async function getAdapter(): Promise<MySQLAdapter> {
  if (!adapter) {
    adapter = new MySQLAdapter();

    const connectionConfig: ConnectionConfig = {
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USERNAME,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      pool: {
        max: config.DB_CONNECTION_LIMIT,
        queueLimit: config.DB_QUEUE_LIMIT,
      },
      connectionTimeout: config.DB_CONNECT_TIMEOUT,
    };

    await adapter.connect(connectionConfig);
    logger.info('Database connection established');
  }
  return adapter;
}

export async function closeDatabase(): Promise<void> {
  if (adapter) {
    await adapter.disconnect();
    adapter = null;
    logger.info('Database connection closed');
  }
}

export async function query<T = unknown>(sql: string, params?: QueryParams): Promise<T[]> {
  const db = await getAdapter();
  const result = await db.query<T>(sql, params);
  return result.rows;
}

export async function execute(
  sql: string,
  params?: QueryParams
): Promise<{ affectedRows: number; insertId: number }> {
  const db = await getAdapter();
  const result = await db.query(sql, params);
  return {
    affectedRows: result.affectedRows ?? 0,
    insertId: result.insertId ?? 0,
  };
}

export interface TransactionContext {
  query: <T = unknown>(sql: string, params?: QueryParams) => Promise<T[]>;
  execute: (
    sql: string,
    params?: QueryParams
  ) => Promise<{ affectedRows: number; insertId: number }>;
}

export async function runInTransaction<T>(
  callback: (tx: TransactionContext) => Promise<T>
): Promise<T> {
  const db = await getAdapter();
  const transaction = await db.beginTransaction();

  try {
    const context: TransactionContext = {
      query: async <R = unknown>(sql: string, params?: QueryParams): Promise<R[]> => {
        const result = await transaction.query<R>(sql, params);
        return result.rows;
      },
      execute: async (sql: string, params?: QueryParams) => {
        const result = await transaction.execute(sql, params);
        return {
          affectedRows: result.affectedRows ?? 0,
          insertId: result.insertId ?? 0,
        };
      },
    };

    const result = await callback(context);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Create a QueryBuilder for fluent queries
 * @example
 * const users = await table('users')
 *   .select('id', 'name')
 *   .where('active', '=', true)
 *   .orderBy('name', 'ASC')
 *   .execute();
 */
export async function table<T = unknown>(tableName: string): Promise<QueryBuilder<T>> {
  const db = await getAdapter();
  return db.createQueryBuilder<T>().table(tableName);
}

export { MySQLAdapter };
export type { Transaction, QueryResult, ConnectionConfig };
