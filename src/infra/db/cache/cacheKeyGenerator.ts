import { createHash } from 'crypto';

/**
 * CacheKeyGenerator - Generates unique cache keys for database queries
 * Ensures no cache collisions between different queries
 */
export class CacheKeyGenerator {
  /**
   * Generate a unique cache key from SQL and parameters
   * Uses MD5 hash (first 8 chars) for uniqueness
   */
  static generate(prefix: string, sql: string, params: unknown[] = []): string {
    const paramsStr = JSON.stringify(params);
    const combined = `${sql}:${paramsStr}`;
    const hash = createHash('md5').update(combined).digest('hex').substring(0, 8);
    return `${prefix}:${hash}`;
  }

  /**
   * Generate cache key for ID-based lookups
   */
  static forId(prefix: string, id: number | string): string {
    return `${prefix}:id:${id}`;
  }

  /**
   * Generate cache key for paginated lists
   */
  static forList(prefix: string, limit: number, offset: number): string {
    return `${prefix}:list:${limit}:${offset}`;
  }

  /**
   * Generate cache key for named queries with optional arguments
   */
  static forNamed(prefix: string, name: string, ...args: unknown[]): string {
    const parts = [prefix, name];
    for (const arg of args) {
      if (arg === null || arg === undefined) {
        parts.push('null');
      } else if (typeof arg === 'object') {
        parts.push(JSON.stringify(arg));
      } else if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
        parts.push(String(arg));
      } else {
        parts.push(JSON.stringify(arg));
      }
    }
    return parts.join(':');
  }

  /**
   * Generate pattern for cache invalidation
   */
  static invalidationPattern(prefix: string): string {
    return `${prefix}*`;
  }
}

/**
 * Shorthand function for generating cache keys
 */
export function cacheKey(prefix: string, sql: string, params: unknown[] = []): string {
  return CacheKeyGenerator.generate(prefix, sql, params);
}
