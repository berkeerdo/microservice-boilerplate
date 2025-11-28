/**
 * Application Error Classes
 * Centralized error definitions for consistent error handling
 */

/**
 * Error details for additional context
 */
export interface ErrorDetails {
  field?: string;
  value?: unknown;
  constraint?: string;
  [key: string]: unknown;
}

/**
 * Base Application Error
 * All custom errors should extend this class
 */
export class AppError extends Error {
  public readonly timestamp: Date;
  public readonly isOperational: boolean;

  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = 'INTERNAL_ERROR',
    public readonly details?: ErrorDetails | ErrorDetails[]
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.isOperational = true; // Operational errors are expected (vs programming errors)
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

/**
 * 400 - Bad Request / Validation Error
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails | ErrorDetails[]) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * 401 - Unauthorized
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * 403 - Forbidden
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * 404 - Not Found
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string | number) {
    const message = identifier
      ? `${resource} with ID '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND', { resource, identifier });
  }
}

/**
 * 409 - Conflict (duplicate, already exists)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 409, 'CONFLICT', details);
  }
}

/**
 * 422 - Unprocessable Entity (business rule violation)
 */
export class BusinessRuleError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 422, 'BUSINESS_RULE_VIOLATION', details);
  }
}

/**
 * 429 - Too Many Requests
 */
export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super('Too many requests, please try again later', 429, 'RATE_LIMIT_EXCEEDED', {
      retryAfter,
    });
  }
}

/**
 * 503 - Service Unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(service: string, message?: string) {
    super(message || `${service} is temporarily unavailable`, 503, 'SERVICE_UNAVAILABLE', {
      service,
    });
  }
}

/**
 * 504 - Gateway Timeout
 */
export class TimeoutError extends AppError {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 504, 'TIMEOUT', {
      operation,
      timeoutMs,
    });
  }
}

/**
 * Database Error
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

/**
 * External Service Error
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: ErrorDetails) {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR', { service, ...details });
  }
}
