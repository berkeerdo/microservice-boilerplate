/**
 * Error Sanitizer Module with i18n Support
 *
 * Simple, clean error sanitization based on isOperational flag.
 *
 * Logic:
 * - AppError with isOperational=true → Show message (translate if possible)
 * - Everything else → Generic translated message
 *
 * Reference: https://github.com/goldbergyoni/nodebestpractices
 */

import { AppError } from './AppError.js';
import { t, getTranslationKeyFromMessage, type TranslationKey } from '../i18n/index.js';
import logger from '../../infra/logger/logger.js';

// ============================================
// TYPES
// ============================================

/**
 * Error type for sanitization
 * Accepts both dot.notation format and any string for backward compatibility
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type ErrorType = TranslationKey | string;

// ============================================
// SANITIZATION
// ============================================

/**
 * Check if a string looks like an i18n key (contains a dot)
 * Examples: 'validation.minLength', 'common.internalError'
 */
function isI18nKey(message: string): boolean {
  return /^[a-z]+\.[a-zA-Z]+$/.test(message);
}

/**
 * Get translation params from error details
 * Extracts 'value' field as 'length' for validation errors, etc.
 */
function getTranslationParams(
  details?: Record<string, unknown>
): Record<string, string | number> | undefined {
  if (!details) {
    return undefined;
  }

  const params: Record<string, string | number> = {};

  // Map 'value' to 'length' for minLength/maxLength errors
  if (details.value !== undefined) {
    params.length = details.value as number;
  }

  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * Sanitize an error message for frontend consumption.
 *
 * Uses isOperational flag to determine if error is safe to show.
 * - Operational errors (AppError with isOperational=true) are user-facing
 * - All other errors get a generic translated message
 *
 * Features:
 * - Supports i18n keys directly from error messages (e.g., 'validation.minLength')
 * - Falls back to ERROR_MESSAGE_TO_KEY mapping for legacy errors
 * - Interpolates parameters from error details
 *
 * @param error - The error to sanitize
 * @param fallbackType - Fallback translation key for non-operational errors
 * @returns A safe, user-friendly message
 */
export function sanitizeErrorMessage(
  error: unknown,
  fallbackType: ErrorType = 'common.internalError'
): string {
  const translateFallback = () => t(fallbackType as TranslationKey);

  // AppError with operational flag = user-facing error
  if (error instanceof AppError && error.isOperational) {
    // Check if message is already an i18n key (new pattern)
    if (isI18nKey(error.message)) {
      const params = getTranslationParams(error.details as Record<string, unknown>);
      return t(error.message as TranslationKey, params);
    }

    // Try to translate known error messages (legacy pattern)
    const translationKey = getTranslationKeyFromMessage(error.message);
    if (translationKey) {
      return t(translationKey);
    }

    // Return original message if no translation
    return error.message;
  }

  // Non-operational AppError - log and return generic
  if (error instanceof AppError) {
    logInternalError(error.message, 'AppError (non-operational)');
    return translateFallback();
  }

  // Standard Error - always treat as internal
  if (error instanceof Error) {
    logInternalError(error.message, 'Error');
    return translateFallback();
  }

  // String error - always treat as internal
  if (typeof error === 'string') {
    logInternalError(error, 'string');
    return translateFallback();
  }

  // Unknown error type
  return translateFallback();
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

/**
 * Log internal errors for debugging
 */
function logInternalError(originalMessage: string, errorType: string): void {
  logger.warn(
    { originalMessage, errorType },
    'Internal error sanitized - generic message returned to frontend'
  );
}
