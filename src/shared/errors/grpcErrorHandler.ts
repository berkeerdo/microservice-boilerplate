/**
 * gRPC Error Handler
 * Creates consistent error responses for gRPC endpoints
 *
 * Uses isOperational flag pattern:
 * - isOperational=true: Show actual error message (user-facing errors)
 * - isOperational=false: Show generic message (internal/programmer errors)
 */
import { AppError } from './AppError.js';
import config from '../../config/env.js';

const isProduction = config.NODE_ENV === 'production';

/**
 * Generic gRPC error response structure
 */
export interface GrpcErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string;
  };
}

/**
 * Create a standardized gRPC error response
 *
 * @param error - The caught error
 * @param fallbackCode - Fallback error code if error doesn't have one
 * @returns Typed error response object
 *
 * @example
 * ```typescript
 * // In gRPC handler
 * try {
 *   const result = await useCase.execute(input);
 *   callback(null, { success: true, data: result });
 * } catch (error) {
 *   callback(null, createGrpcErrorResponse(error, 'OPERATION_FAILED'));
 * }
 * ```
 */
export function createGrpcErrorResponse<T extends GrpcErrorResponse>(
  error: unknown,
  fallbackCode: string
): T {
  const isOperational = error instanceof AppError && error.isOperational;

  // Determine error code
  let code = fallbackCode;
  if (error instanceof AppError && error.code) {
    code = error.code;
  }

  // Determine message (only show actual message for operational errors)
  const message = isOperational
    ? error.message
    : 'Beklenmeyen bir hata olustu. Lutfen tekrar deneyin.';

  // Build response
  const response: GrpcErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };

  // Add details only in development (never leak stack traces in production)
  if (!isProduction && error instanceof Error) {
    response.error.details = error.message;
  }

  return response as T;
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
