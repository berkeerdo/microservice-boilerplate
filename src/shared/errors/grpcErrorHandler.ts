/**
 * gRPC Error Handler
 *
 * Single Responsibility: Create standardized gRPC error responses
 *
 * Uses errorSanitizer for message sanitization with i18n support.
 * Automatically uses the locale from RequestContext.
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
// GRPC RESPONSE CREATORS
// ============================================

/**
 * Create a standardized gRPC error response
 *
 * NOTE: Locale is automatically retrieved from RequestContext
 *
 * @example
 * // New format (recommended)
 * callback(null, createGrpcErrorResponse(error, 'common.internalError'));
 *
 * // Legacy format (still works)
 * callback(null, createGrpcErrorResponse(error, 'OPERATION_FAILED'));
 */
export function createGrpcErrorResponse(
  error: unknown,
  fallbackType = 'common.internalError'
): { success: false; message: string; error: string } {
  const message = sanitizeErrorMessage(error, fallbackType);
  return {
    success: false,
    message,
    error: message,
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
