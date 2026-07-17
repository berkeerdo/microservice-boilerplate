import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import config from '../../config/env.js';
import logger from '../../infra/logger/logger.js';
import { getRedisClient } from '../../infra/redis/redis.js';

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
  // Distributed rate limiting when Redis is available (falls back to in-memory)
  const redis = getRedisClient();

  await fastify.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    ...(redis ? { redis, nameSpace: 'rate-limit:' } : {}),

    // Key by authenticated user, otherwise by client IP.
    // NEVER key by correlation/request id headers: they are client-controlled
    // and rotating them would bypass the limiter entirely.
    keyGenerator: (request) => {
      const userId = (request as { userId?: string }).userId;
      if (userId) {
        return `user:${userId}`;
      }
      return request.ip;
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
