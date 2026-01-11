/**
 * Type declarations for @fastify/under-pressure extensions
 * Extends FastifyInstance with memoryUsage method added by the plugin
 */
import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Get current memory and event loop metrics
     * Added by @fastify/under-pressure plugin
     */
    memoryUsage(): UnderPressureMetrics;
  }
}

/**
 * Metrics returned by memoryUsage()
 */
export interface UnderPressureMetrics {
  /** Event loop delay in milliseconds */
  eventLoopDelay: number;
  /** Heap memory used in bytes */
  heapUsed: number;
  /** Resident Set Size in bytes */
  rssBytes: number;
  /** Event loop utilization (0-1) */
  eventLoopUtilized: number;
}

// Re-export the library's own options type for use in code
export type { FastifyUnderPressureOptions as UnderPressureOptions } from '@fastify/under-pressure';
