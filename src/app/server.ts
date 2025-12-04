import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { stdTimeFunctions } from 'pino';
import config from '../config/env.js';
import { errorHandler } from '../shared/errors/errorHandler.js';
import { registerRoutes } from './routes/index.js';
import {
  registerCorrelationId,
  registerRateLimiter,
  registerJwtAuth,
  registerValidationErrorHandler,
  registerBackpressure,
} from './middlewares/index.js';
import { registerSwagger } from './plugins/index.js';
import { gracefulShutdown } from '../infra/shutdown/gracefulShutdown.js';
import logger from '../infra/logger/logger.js';

/**
 * Create and configure Fastify server
 */
export async function createServer(): Promise<FastifyInstance> {
  const isDevelopment = config.NODE_ENV === 'development';
  const isTest = config.NODE_ENV === 'test';

  // Create Fastify instance with logger
  const fastify = Fastify({
    logger: isTest
      ? false
      : isDevelopment
        ? {
            level: config.LOG_LEVEL,
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
                singleLine: false,
              },
            },
          }
        : {
            level: config.LOG_LEVEL,
            timestamp: stdTimeFunctions.isoTime,
            formatters: {
              level: (label) => ({ level: label }),
            },
            base: {
              service: config.SERVICE_NAME,
              version: config.SERVICE_VERSION,
            },
          },
    // Increase body size limit if needed
    bodyLimit: 1048576, // 1MB
    // Trust proxy for rate limiting behind load balancer
    trustProxy: true,
  });

  // ============================================
  // SECURITY PLUGINS
  // ============================================

  // Helmet - Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  // CORS - Cross-Origin Resource Sharing
  const corsOrigins =
    config.CORS_ORIGINS?.split(',')
      .map((o) => o.trim())
      .filter(Boolean) || [];
  await fastify.register(cors, {
    origin: isDevelopment ? true : corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Correlation-ID'],
  });

  // ============================================
  // CORE MIDDLEWARES
  // ============================================

  // Correlation ID - Request tracing
  registerCorrelationId(fastify);

  // Rate Limiter - DoS protection
  await registerRateLimiter(fastify);

  // Backpressure - Server overload protection
  await registerBackpressure(fastify);

  // JWT Authentication
  await registerJwtAuth(fastify);

  // Validation error handler
  registerValidationErrorHandler(fastify);

  // ============================================
  // DOCUMENTATION
  // ============================================

  // Swagger/OpenAPI documentation
  await registerSwagger(fastify);

  // ============================================
  // ROUTES
  // ============================================

  registerRoutes(fastify);

  // ============================================
  // ERROR HANDLING
  // ============================================

  fastify.setErrorHandler(errorHandler);

  // ============================================
  // GRACEFUL SHUTDOWN
  // ============================================

  // Register Fastify for graceful shutdown
  gracefulShutdown.registerFastify(fastify);

  logger.info(
    {
      service: config.SERVICE_NAME,
      version: config.SERVICE_VERSION,
      env: config.NODE_ENV,
    },
    '🚀 Server configured'
  );

  return fastify;
}
