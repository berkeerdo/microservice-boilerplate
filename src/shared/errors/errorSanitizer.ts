/**
 * Error Sanitizer Module
 *
 * Simple error sanitization based on isOperational flag.
 *
 * Logic:
 * - AppError with isOperational=true → Show message (safe for frontend)
 * - Everything else → Generic message (hide internal details)
 *
 * Reference: https://github.com/goldbergyoni/nodebestpractices
 */

import { AppError } from './AppError.js';
import logger from '../../infra/logger/logger.js';

// ============================================
// DEFAULT MESSAGES
// ============================================

export const DEFAULT_ERROR_MESSAGE = 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';
export const SERVICE_UNAVAILABLE_MESSAGE =
  'Servis şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.';

// ============================================
// SANITIZATION
// ============================================

/**
 * Sanitize an error for frontend consumption.
 *
 * Uses isOperational flag to determine if error is safe to show.
 * - Operational errors (AppError with isOperational=true) are user-facing
 * - All other errors get a generic message
 *
 * @param error - The error to sanitize
 * @param fallbackMessage - Optional custom fallback message
 * @returns A safe, user-friendly message
 */
export function sanitizeError(error: unknown, fallbackMessage?: string): string {
  const defaultMessage = fallbackMessage ?? DEFAULT_ERROR_MESSAGE;

  // AppError with operational flag = user-facing error
  if (error instanceof AppError && error.isOperational) {
    return error.message;
  }

  // Non-operational AppError - log and return generic
  if (error instanceof AppError) {
    logInternalError(error.message, 'AppError (non-operational)');
    return defaultMessage;
  }

  // Standard Error - always treat as internal
  if (error instanceof Error) {
    logInternalError(error.message, 'Error');
    return defaultMessage;
  }

  // String error - always treat as internal
  if (typeof error === 'string') {
    logInternalError(error, 'string');
    return defaultMessage;
  }

  // Unknown error type
  return defaultMessage;
}

/**
 * Check if an error is safe to expose to frontend
 */
export function isSafeForFrontend(error: unknown): boolean {
  return error instanceof AppError && error.isOperational;
}

// ============================================
// INTERNAL
// ============================================

function logInternalError(originalMessage: string, errorType: string): void {
  logger.warn(
    { originalMessage, errorType },
    'Internal error sanitized - generic message returned to frontend'
  );
}
