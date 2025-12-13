/**
 * Fallback Cache
 *
 * Simple in-memory cache for graceful degradation when gRPC services are unavailable.
 * Returns stale data when service is down, preventing complete failures.
 */
import type { CacheEntry } from './types.js';
import logger from '../logger/logger.js';

export class FallbackCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;
  private readonly serviceName: string;

  constructor(serviceName: string, maxSize = 100, defaultTtlMs = 60000) {
    this.serviceName = serviceName;
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Get value from cache
   * Returns stale data for graceful degradation (logs warning if expired)
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      logger.debug(
        { service: this.serviceName, key },
        'Returning stale cache entry (expired but valid for degradation)'
      );
    }

    return entry.data as T;
  }

  /**
   * Set value in cache with optional TTL override
   */
  set<T>(key: string, data: T, ttlMs?: number): void {
    // Enforce max cache size (LRU-like: remove oldest entry)
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs ?? this.defaultTtlMs,
    });
  }

  /**
   * Check if key exists in cache (regardless of expiry)
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete specific key from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    logger.debug({ service: this.serviceName }, 'Fallback cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; keys: string[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Remove expired entries (optional cleanup)
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug({ service: this.serviceName, removed }, 'Expired cache entries cleaned up');
    }

    return removed;
  }
}

export default FallbackCache;
