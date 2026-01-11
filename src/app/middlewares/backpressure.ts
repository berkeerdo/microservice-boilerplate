import type { FastifyInstance } from 'fastify';
import underPressure from '@fastify/under-pressure';
import config from '../../config/env.js';
import logger from '../../infra/logger/logger.js';
import type {
  UnderPressureMetrics,
  UnderPressureOptions,
} from '../../types/fastify-under-pressure.js';

/**
 * Backpressure metrics for monitoring
 */
export interface BackpressureMetrics {
  eventLoopDelay: number;
  heapUsedBytes: number;
  rssBytes: number;
  eventLoopUtilized: number;
}

/** Pressure types that can trigger backpressure handler */
type PressureType = 'eventLoopDelay' | 'heapUsedBytes' | 'rssBytes' | 'eventLoopUtilization';

/**
 * Register backpressure middleware
 * Protects against server overload by monitoring system resources
 */
export async function registerBackpressure(fastify: FastifyInstance): Promise<void> {
  if (!config.BACKPRESSURE_ENABLED) {
    logger.info('Backpressure monitoring disabled');
    return;
  }

  const options: UnderPressureOptions = {
    // Max event loop delay before returning 503
    maxEventLoopDelay: config.BACKPRESSURE_MAX_EVENT_LOOP_DELAY,

    // Retry-After header value (in seconds)
    retryAfter: config.BACKPRESSURE_RETRY_AFTER,

    // Custom error message
    message: 'Service temporarily unavailable due to high load',

    // Expose status route at /status
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'warn',
      },
      url: '/status',
      routeSchemaOpts: {
        hide: true,
      },
    },

    // Custom health check function (returns Promise per library type)
    healthCheck: (_fastify) => {
      // Add custom health checks here if needed
      return Promise.resolve(true);
    },

    // Health check interval (5 seconds)
    healthCheckInterval: 5000,

    // Callback when pressure is detected
    pressureHandler: (_req, _rep, type, value) => {
      logger.warn(
        {
          type,
          value,
          threshold: getThreshold(type as PressureType),
        },
        'Backpressure detected - service under high load'
      );
    },
  };

  // Only add heap/rss limits if configured (0 = disabled)
  if (config.BACKPRESSURE_MAX_HEAP_USED_BYTES > 0) {
    options.maxHeapUsedBytes = config.BACKPRESSURE_MAX_HEAP_USED_BYTES;
  }

  if (config.BACKPRESSURE_MAX_RSS_BYTES > 0) {
    options.maxRssBytes = config.BACKPRESSURE_MAX_RSS_BYTES;
  }

  await fastify.register(underPressure, options);

  logger.info(
    {
      maxEventLoopDelay: config.BACKPRESSURE_MAX_EVENT_LOOP_DELAY,
      maxHeapUsedBytes: config.BACKPRESSURE_MAX_HEAP_USED_BYTES || 'disabled',
      maxRssBytes: config.BACKPRESSURE_MAX_RSS_BYTES || 'disabled',
      retryAfter: config.BACKPRESSURE_RETRY_AFTER,
    },
    'Backpressure monitoring registered'
  );
}

/**
 * Get threshold for a specific metric type
 */
function getThreshold(
  type: 'eventLoopDelay' | 'heapUsedBytes' | 'rssBytes' | 'eventLoopUtilization'
): number | string {
  switch (type) {
    case 'eventLoopDelay':
      return config.BACKPRESSURE_MAX_EVENT_LOOP_DELAY;
    case 'heapUsedBytes':
      return config.BACKPRESSURE_MAX_HEAP_USED_BYTES || 'disabled';
    case 'rssBytes':
      return config.BACKPRESSURE_MAX_RSS_BYTES || 'disabled';
    case 'eventLoopUtilization':
      return 'disabled';
    default:
      return 'unknown';
  }
}

/**
 * Get current backpressure metrics
 * Can be used for monitoring dashboards
 */
export function getBackpressureMetrics(fastify: FastifyInstance): BackpressureMetrics | null {
  try {
    // memoryUsage is added by @fastify/under-pressure plugin
    // Type is extended in types/fastify-under-pressure.d.ts
    const memoryUsage: UnderPressureMetrics = fastify.memoryUsage();

    return {
      eventLoopDelay: memoryUsage.eventLoopDelay,
      heapUsedBytes: memoryUsage.heapUsed,
      rssBytes: memoryUsage.rssBytes,
      eventLoopUtilized: memoryUsage.eventLoopUtilized,
    };
  } catch {
    return null;
  }
}
