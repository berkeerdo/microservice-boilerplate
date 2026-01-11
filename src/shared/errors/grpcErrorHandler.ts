/**
 * gRPC Error Handler
 *
 * Single Responsibility: Create standardized gRPC error responses
 *
 * Uses errorSanitizer for message sanitization with i18n support.
 * Automatically uses the locale from RequestContext.
 *
 * Key Features:
 * - Extracts HTTP-equivalent status codes from AppError instances
 * - Sanitizes error messages with i18n translation
 * - Returns consistent response format for gateway error mapping
 *
 * Usage:
 *   // In handler (inside RequestContext):
 *   callback(null, createGrpcErrorResponse(error, 'common.internalError'));
 *
 *   // The locale is automatically retrieved from context
 */
import { sanitizeErrorMessage, type ErrorType } from './errorSanitizer.js';
import { AppError } from './AppError.js';

// Re-export types
export type { ErrorType };

// Re-export sanitizeErrorMessage
export { sanitizeErrorMessage } from './errorSanitizer.js';

// ============================================
// HTTP STATUS CODES
// ============================================

/**
 * HTTP Status Codes - Developer-friendly constants
 *
 * @example
 * // In use cases or handlers:
 * import { HttpStatus } from '../shared/errors/index.js';
 *
 * if (userExists) {
 *   throw new ConflictError('user.alreadyExists'); // status_code: 409, i18n translated
 * }
 *
 * // Or for manual status code usage:
 * return { status_code: HttpStatus.CONFLICT };
 */
export const HttpStatus = {
  // 2xx Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,

  // 4xx Client Errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  GONE: 410,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  // 5xx Server Errors
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];

/**
 * HTTP Status Names - Reverse lookup for status codes
 *
 * @example
 * HttpStatusName[409] // 'CONFLICT'
 * HttpStatusName[404] // 'NOT_FOUND'
 */
export const HttpStatusName: Record<number, string> = {
  200: 'OK',
  201: 'CREATED',
  202: 'ACCEPTED',
  204: 'NO_CONTENT',
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  410: 'GONE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
  501: 'NOT_IMPLEMENTED',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};

// ============================================
// ERROR TO STATUS CODE MAPPING
// ============================================

/**
 * Error name to HTTP status code mapping
 * Used when error doesn't have explicit statusCode property
 */
const ERROR_NAME_TO_STATUS: Record<string, number> = {
  ValidationError: HttpStatus.BAD_REQUEST,
  UnauthorizedError: HttpStatus.UNAUTHORIZED,
  ForbiddenError: HttpStatus.FORBIDDEN,
  NotFoundError: HttpStatus.NOT_FOUND,
  ConflictError: HttpStatus.CONFLICT,
  BusinessRuleError: HttpStatus.UNPROCESSABLE_ENTITY,
  RateLimitError: HttpStatus.TOO_MANY_REQUESTS,
  ServiceUnavailableError: HttpStatus.SERVICE_UNAVAILABLE,
  TimeoutError: HttpStatus.GATEWAY_TIMEOUT,
  DatabaseError: HttpStatus.INTERNAL_SERVER_ERROR,
  ExternalServiceError: HttpStatus.BAD_GATEWAY,
};

/**
 * Extract HTTP-equivalent status code from error
 *
 * Priority:
 * 1. AppError.statusCode property
 * 2. Error name mapping (ValidationError -> 400, etc.)
 * 3. Default to 500 (Internal Server Error)
 *
 * @param error - Any error object
 * @returns HTTP status code (400-599)
 */
export function extractStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as { statusCode?: number; name?: string };

    // Check for explicit statusCode property
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) {
      return err.statusCode;
    }

    // Map error name to status code
    if (err.name && ERROR_NAME_TO_STATUS[err.name]) {
      return ERROR_NAME_TO_STATUS[err.name];
    }
  }

  return HttpStatus.INTERNAL_SERVER_ERROR; // Default to Internal Server Error
}

// ============================================
// GRPC RESPONSE CREATORS
// ============================================

/**
 * Standard gRPC error response type
 *
 * This type is used by gateway to:
 * - Detect errors via `success: false`
 * - Display user-friendly message via `message`
 * - Map to correct HTTP status via `status_code`
 */
export interface GrpcErrorResponse {
  success: false;
  message: string;
  error: string;
  status_code: number;
}

/**
 * Create a standardized gRPC error response
 *
 * NOTE: Locale is automatically retrieved from RequestContext
 *
 * The response includes:
 * - success: false (for gateway error detection)
 * - message: User-friendly, i18n-translated message
 * - error: Same as message (for backward compatibility)
 * - status_code: HTTP-equivalent status code for gateway mapping
 *
 * @example
 * // Recommended format (i18n key)
 * callback(null, createGrpcErrorResponse(error, 'team.createFailed'));
 *
 * // The gateway will:
 * // 1. Detect success: false
 * // 2. Extract status_code (e.g., 409 for ConflictError)
 * // 3. Throw appropriate HTTP error (e.g., ConflictError)
 * // 4. Return HTTP 409 with the translated message
 */
export function createGrpcErrorResponse(
  error: unknown,
  fallbackType = 'common.internalError'
): GrpcErrorResponse {
  const message = sanitizeErrorMessage(error, fallbackType);
  const statusCode = extractStatusCode(error);

  return {
    success: false as const,
    message,
    error: message,
    status_code: statusCode,
  };
}

/**
 * Type guard to check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard to check if error is operational (safe to show to users)
 */
export function isOperationalError(error: unknown): boolean {
  return error instanceof AppError && error.isOperational;
}
