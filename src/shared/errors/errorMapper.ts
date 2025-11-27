import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import logger from '../../infra/logger/logger.js';

/**
 * Application Error Base Class
 */
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

/**
 * Not Found Error
 */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * Unauthorized Error
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * Forbidden Error
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Conflict Error
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Global error handler for Fastify
 */
export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const requestId = request.id;

  // Handle AppError instances
  if (error instanceof AppError) {
    logger.warn({
      requestId,
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
    });

    void reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
      statusCode: error.statusCode,
    });
    return;
  }

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    logger.warn({
      requestId,
      error: 'Validation failed',
      validation: error.validation,
    });

    void reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: error.message,
      statusCode: 400,
    });
    return;
  }

  // Handle unknown errors
  logger.error({
    requestId,
    error: error.message,
    stack: error.stack,
  });

  // In test/development, expose actual error for debugging
  const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  void reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: isDev ? error.message : 'An unexpected error occurred',
    statusCode: 500,
  });
}
