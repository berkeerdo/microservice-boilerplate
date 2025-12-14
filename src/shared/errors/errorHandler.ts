/**
 * Centralized Error Handler with i18n Support
 *
 * Handles all errors consistently across the application with:
 * - Automatic i18n translation via errorSanitizer
 * - Proper error categorization (AppError, Zod, JWT, etc.)
 * - Sentry reporting for non-operational errors
 * - Request context awareness for locale
 *
 * @example
 * // In server.ts
 * fastify.setErrorHandler(errorHandler);
 */
import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import logger from '../../infra/logger/logger.js';
import { captureException } from '../../infra/monitoring/sentry.js';
import { AppError } from './AppError.js';
import { sanitizeErrorMessage } from './errorSanitizer.js';
import { HttpStatus } from './grpcErrorHandler.js';
import { t, type TranslationKey } from '../i18n/index.js';

/**
 * Error response format (RFC 7807 inspired)
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
 * Format Zod validation errors with i18n support
 */
function formatZodError(error: ZodError): { field: string; message: string }[] {
  const issues = (error as { issues?: unknown[] }).issues || [];
  return issues.map((issue) => {
    const iss = issue as { path?: unknown[]; message?: string; code?: string };
    const field = Array.isArray(iss.path) ? iss.path.map(String).join('.') : '';

    // Try to translate the Zod error message
    // Zod messages like "Required" can be mapped to i18n keys
    let message = iss.message || 'Validation error';

    // Map common Zod messages to i18n keys
    if (iss.code === 'invalid_type' && iss.message === 'Required') {
      message = t('validation.required' as TranslationKey);
    }

    return { field, message };
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
 *
 * Handles errors in priority order:
 * 1. AppError (custom operational errors) - translated message
 * 2. ZodError (validation) - field-level details
 * 3. Fastify validation errors - schema validation
 * 4. JWT errors - authentication failures
 * 5. Unknown errors - generic message (logged to Sentry)
 *
 * All messages are translated using the current request locale.
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
    // Use sanitizeErrorMessage for i18n translation
    const sanitizedMessage = sanitizeErrorMessage(error);

    logger.warn({
      requestId,
      correlationId,
      error: error.code,
      originalMessage: error.message,
      sanitizedMessage,
      statusCode: error.statusCode,
      details: error.details,
    });

    void reply
      .status(error.statusCode)
      .send(
        createErrorResponse(
          error.code,
          sanitizedMessage,
          error.statusCode,
          requestId,
          error.details
        )
      );
    return;
  }

  // 2. Handle Zod validation errors
  if (error instanceof ZodError) {
    const details = formatZodError(error);
    const message = t('validation.failed' as TranslationKey);

    logger.warn({
      requestId,
      correlationId,
      error: 'VALIDATION_ERROR',
      details,
    });

    void reply
      .status(HttpStatus.BAD_REQUEST)
      .send(
        createErrorResponse('VALIDATION_ERROR', message, HttpStatus.BAD_REQUEST, requestId, details)
      );
    return;
  }

  // 3. Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    const message = t('validation.failed' as TranslationKey);

    logger.warn({
      requestId,
      correlationId,
      error: 'VALIDATION_ERROR',
      validation: error.validation,
    });

    void reply
      .status(HttpStatus.BAD_REQUEST)
      .send(
        createErrorResponse(
          'VALIDATION_ERROR',
          message,
          HttpStatus.BAD_REQUEST,
          requestId,
          error.validation
        )
      );
    return;
  }

  // 4. Handle JWT errors
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    const message =
      error.name === 'TokenExpiredError'
        ? t('auth.tokenExpired' as TranslationKey)
        : t('auth.invalidToken' as TranslationKey);

    logger.warn({
      requestId,
      correlationId,
      error: 'AUTHENTICATION_ERROR',
      errorName: error.name,
    });

    void reply
      .status(HttpStatus.UNAUTHORIZED)
      .send(
        createErrorResponse('AUTHENTICATION_ERROR', message, HttpStatus.UNAUTHORIZED, requestId)
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

  // In dev, show original message for debugging
  // In prod, show translated generic message
  const isDev = process.env.NODE_ENV === 'development';
  const message = isDev ? error.message : sanitizeErrorMessage(error, 'common.internalError');

  void reply
    .status(HttpStatus.INTERNAL_SERVER_ERROR)
    .send(
      createErrorResponse('INTERNAL_ERROR', message, HttpStatus.INTERNAL_SERVER_ERROR, requestId)
    );
}

/**
 * Not found handler for undefined routes
 */
export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): void {
  const requestId = request.id;
  const message = t('common.routeNotFound' as TranslationKey);

  logger.debug(
    {
      requestId,
      url: request.url,
      method: request.method,
    },
    'Route not found'
  );

  void reply
    .status(HttpStatus.NOT_FOUND)
    .send(createErrorResponse('ROUTE_NOT_FOUND', message, HttpStatus.NOT_FOUND, requestId));
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
