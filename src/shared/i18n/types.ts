/**
 * i18n Type Definitions
 *
 * Provides type-safe translation keys for the application.
 * Extend these types as you add more translations.
 */

// ============================================
// SUPPORTED LOCALES
// ============================================

export type SupportedLocale = 'tr' | 'en';

export const DEFAULT_LOCALE: SupportedLocale = 'tr';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['tr', 'en'] as const;

// ============================================
// TRANSLATION KEY TYPES
// ============================================

/** Common translation keys (shared across all services) */
export type CommonTranslationKey =
  | 'common.internalError'
  | 'common.validationError'
  | 'common.notFound'
  | 'common.unauthorized'
  | 'common.forbidden'
  | 'common.rateLimitExceeded'
  | 'common.serviceUnavailable';

/**
 * All available translation keys
 * Extend this type union as you add domain-specific keys
 */
export type TranslationKey = CommonTranslationKey;

// ============================================
// ERROR MESSAGE TO KEY MAPPING
// ============================================

/**
 * Maps error messages (lowercase) to translation keys
 * Used for automatic translation of thrown error messages
 * Add mappings for your service-specific error messages
 */
export const ERROR_MESSAGE_TO_KEY: Record<string, TranslationKey> = {
  // Add your error message mappings here
  // Example: 'resource not found': 'common.notFound',
};
