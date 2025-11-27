import { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import config from '../../config/env.js';
import logger from '../../infra/logger/logger.js';

/**
 * Rate limit exceeded error response
 */
interface RateLimitError {
  statusCode: number;
  error: string;
  message: string;
  retryAfter: number;
}

/**
 * Register rate limiting middleware
 * Protects against abuse and DoS attacks
 */
export async function registerRateLimiter(fastify: FastifyInstance): Promise<void> {
  await fastify.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,

    // Use correlation ID or IP as key
    keyGenerator: (request) => {
      // Prefer user ID if authenticated
      const userId = (request as { userId?: string }).userId;
      if (userId) return `user:${userId}`;

      // Fall back to correlation ID or IP
      return request.correlationId || request.ip;
    },

    // Custom error response
    errorResponseBuilder: (request, context): RateLimitError => {
      logger.warn(
        {
          ip: request.ip,
          correlationId: request.correlationId,
          max: context.max,
          remaining: 0,
        },
        'Rate limit exceeded'
      );

      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
        retryAfter: Math.ceil(context.ttl / 1000),
      };
    },

    // Add rate limit headers to response
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },

    // Skip rate limiting for health check
    allowList: (request) => {
      return request.url === '/health' || request.url === '/ready';
    },
  });

  logger.info(
    { max: config.RATE_LIMIT_MAX, windowMs: config.RATE_LIMIT_WINDOW_MS },
    'Rate limiter registered'
  );
}
