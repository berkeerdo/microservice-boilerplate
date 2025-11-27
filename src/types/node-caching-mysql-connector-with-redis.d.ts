/**
 * Type declarations for node-caching-mysql-connector-with-redis
 * This module provides MySQL queries with Redis caching
 */
declare module 'node-caching-mysql-connector-with-redis' {
  /**
   * Execute a SELECT query with caching
   * @param sql - SQL query string
   * @param params - Query parameters
   * @param cacheName - Cache key name
   * @returns Promise resolving to query results
   */
  export function getCacheQuery<T = unknown>(
    sql: string,
    params: unknown[],
    cacheName: string
  ): Promise<T[]>;

  /**
   * Execute a write query (INSERT, UPDATE, DELETE) with cache invalidation
   * @param sql - SQL query string
   * @param params - Query parameters
   * @param resetCacheName - Cache pattern to invalidate
   * @returns Promise resolving to MySQL result
   */
  export function QuaryCache(
    sql: string,
    params: unknown[],
    resetCacheName: string
  ): Promise<{
    affectedRows: number;
    insertId: number;
    changedRows: number;
  }>;

  /**
   * Execute queries within a transaction
   * @param callback - Transaction callback function
   * @returns Promise resolving to callback result
   */
  export function withTransaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T>;

  /**
   * Initialize the database connection
   * @param config - Database configuration
   */
  export function initializeDatabase(config: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionLimit?: number;
  }): Promise<void>;

  /**
   * Close database connection
   */
  export function closeDatabase(): Promise<void>;

  /**
   * Initialize Redis connection for caching
   * @param config - Redis configuration
   */
  export function initializeRedis(config: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  }): Promise<void>;

  /**
   * Close Redis connection
   */
  export function closeRedis(): Promise<void>;
}
