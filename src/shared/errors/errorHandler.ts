/**
 * Centralized Error Handler
 * Handles all errors consistently across the application
 */
import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import logger from '../../infra/logger/logger.js';
import { captureException } from '../../infra/monitoring/sentry.js';
import { AppError } from './AppError.js';

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
  requestId?: string;
  timestamp: string;
}

/**
 * Format Zod validation errors
 */
function formatZodError(error: ZodError): { field: string; message: string }[] {
  // Handle both Zod v3 (errors) and v4 (issues)
  const issues = (error as { issues?: unknown[] }).issues || [];
  return issues.map((issue) => {
    const iss = issue as { path?: unknown[]; message?: string };
    return {
      field: Array.isArray(iss.path) ? iss.path.map(String).join('.') : '',
      message: iss.message || 'Validation error',
    };
  });
}

/**
 * Create error response object
 */
function createErrorResponse(
  code: string,
  message: string,
  statusCode: number,
  requestId?: string,
  details?: unknown
): ErrorResponse {
  return {
    error: code,
    message,
    statusCode,
    details,
    requestId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Global error handler for Fastify
 * Register this with: fastify.setErrorHandler(errorHandler)
 */
export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const requestId = request.id;
  const correlationId = (request.headers['x-correlation-id'] as string) || requestId;

  // 1. Handle our custom AppError instances
  if (error instanceof AppError) {
    logger.warn({
      requestId,
      correlationId,
      error: error.code,
      message: error.message,
      statusCode: error.statusCode,
      details: error.details,
    });

    void reply
      .status(error.statusCode)
      .send(
        createErrorResponse(error.code, error.message, error.statusCode, requestId, error.details)
      );
    return;
  }

  // 2. Handle Zod validation errors
  if (error instanceof ZodError) {
    const details = formatZodError(error);
    logger.warn({
      requestId,
      correlationId,
      error: 'VALIDATION_ERROR',
      details,
    });

    void reply
      .status(400)
      .send(createErrorResponse('VALIDATION_ERROR', 'Validation failed', 400, requestId, details));
    return;
  }

  // 3. Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    logger.warn({
      requestId,
      correlationId,
      error: 'VALIDATION_ERROR',
      validation: error.validation,
    });

    void reply
      .status(400)
      .send(
        createErrorResponse('VALIDATION_ERROR', error.message, 400, requestId, error.validation)
      );
    return;
  }

  // 4. Handle JWT errors
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    logger.warn({
      requestId,
      correlationId,
      error: 'AUTHENTICATION_ERROR',
      message: error.message,
    });

    void reply
      .status(401)
      .send(
        createErrorResponse('AUTHENTICATION_ERROR', 'Invalid or expired token', 401, requestId)
      );
    return;
  }

  // 5. Handle unknown/unexpected errors
  logger.error({
    requestId,
    correlationId,
    error: error.message,
    stack: error.stack,
    name: error.name,
  });

  // Report to Sentry (only non-operational errors)
  captureException(error, {
    requestId,
    correlationId,
    url: request.url,
    method: request.method,
  });

  // Hide internal error details in production
  const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  const message = isDev ? error.message : 'An unexpected error occurred';

  void reply.status(500).send(createErrorResponse('INTERNAL_ERROR', message, 500, requestId));
}

/**
 * Not found handler for undefined routes
 */
export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): void {
  const requestId = request.id;

  logger.debug(
    {
      requestId,
      url: request.url,
      method: request.method,
    },
    'Route not found'
  );

  void reply
    .status(404)
    .send(
      createErrorResponse(
        'ROUTE_NOT_FOUND',
        `Route ${request.method} ${request.url} not found`,
        404,
        requestId
      )
    );
}

/**
 * Async error wrapper for route handlers
 * Catches promise rejections and forwards to error handler
 *
 * Note: Fastify handles async errors automatically, this wrapper
 * is provided for explicit error handling patterns if needed.
 */
export function asyncHandler<T>(
  fn: (request: FastifyRequest, reply: FastifyReply) => Promise<T>
): (request: FastifyRequest, reply: FastifyReply) => Promise<T> {
  return (request: FastifyRequest, reply: FastifyReply) => fn(request, reply);
}
