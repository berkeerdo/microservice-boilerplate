/**
 * i18n Module
 *
 * Provides internationalization support for the application.
 * Uses JSON files for translations and supports type-safe keys.
 *
 * @example
 * // Basic usage (uses RequestContext locale)
 * const message = t('common.internalError');
 *
 * // With explicit locale
 * const message = t('common.internalError', 'en');
 */
import { RequestContext } from '../context/index.js';
import enLocale from './locales/en.json' with { type: 'json' };
import trLocale from './locales/tr.json' with { type: 'json' };
import {
  type SupportedLocale,
  type TranslationKey,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  ERROR_MESSAGE_TO_KEY,
} from './types.js';

// Re-export types
export * from './types.js';

// ============================================
// STATIC TRANSLATIONS
// ============================================

interface NestedTranslation {
  [key: string]: string | NestedTranslation;
}
type TranslationData = NestedTranslation;

const TRANSLATIONS: Record<SupportedLocale, TranslationData> = {
  en: enLocale as TranslationData,
  tr: trLocale as TranslationData,
};

/**
 * Get translations for a locale
 */
function getTranslations(locale: SupportedLocale): TranslationData {
  switch (locale) {
    case 'en':
      return TRANSLATIONS.en;
    case 'tr':
      return TRANSLATIONS.tr;
    default:
      return TRANSLATIONS.en;
  }
}

/**
 * Pre-load all translations at startup
 * No-op: Translations are loaded statically via imports
 */
export function preloadTranslations(): void {
  // No-op: Translations are loaded statically via imports
}

// ============================================
// TRANSLATION FUNCTION
// ============================================

/**
 * Type guard to check if a value is a record object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Safely get property from object using direct access
 */
function safeGet(obj: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(obj, key) ? obj[key] : undefined;
}

/**
 * Get a nested value from an object using dot notation
 * Uses type-safe traversal with proper type narrowing
 */
function getNestedValue(obj: TranslationData, key: string): string | undefined {
  const parts = key.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = safeGet(current, part);
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Translation parameters for interpolation
 */
export type TranslationParams = Record<string, string | number>;

/**
 * Interpolate parameters into a translation string
 * Replaces {{key}} with the corresponding value from params
 *
 * @example
 * interpolate('Password must be at least {{length}} characters.', { length: 8 })
 * // Returns: 'Password must be at least 8 characters.'
 */
function interpolate(text: string, params?: TranslationParams): string {
  if (!params) {
    return text;
  }

  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = Object.hasOwn(params, key) ? params[key] : undefined;
    if (value === undefined) {
      return `{{${key}}}`;
    }
    return String(value);
  });
}

/**
 * Translate a key to the current locale
 *
 * @param key - The translation key (e.g., 'common.internalError')
 * @param paramsOrLocale - Optional parameters for interpolation or locale override
 * @param locale - Optional locale override (defaults to RequestContext locale)
 * @returns Translated string or the key itself if not found
 *
 * @example
 * t('common.internalError') // Uses RequestContext.getLocale()
 * t('validation.minLength', { length: 8 }) // With parameters
 * t('common.internalError', 'en') // Forces English
 * t('validation.minLength', { length: 8 }, 'en') // With params and locale
 */
export function t(
  key: TranslationKey,
  paramsOrLocale?: TranslationParams | SupportedLocale,
  locale?: SupportedLocale
): string {
  // Handle overloaded parameters
  let params: TranslationParams | undefined;
  let effectiveLocale: SupportedLocale;

  if (typeof paramsOrLocale === 'string') {
    // t(key, locale)
    effectiveLocale = paramsOrLocale;
    params = undefined;
  } else {
    // t(key, params?, locale?)
    params = paramsOrLocale;
    effectiveLocale = locale ?? RequestContext.getLocale();
  }

  const translations = getTranslations(effectiveLocale);
  const value = getNestedValue(translations, key);

  if (value) {
    return interpolate(value, params);
  }

  // Fallback to default locale
  if (effectiveLocale !== DEFAULT_LOCALE) {
    const defaultTranslations = getTranslations(DEFAULT_LOCALE);
    const defaultValue = getNestedValue(defaultTranslations, key);
    if (defaultValue) {
      return interpolate(defaultValue, params);
    }
  }

  return key;
}

// ============================================
// ERROR MESSAGE HELPERS
// ============================================

/**
 * Get translation key from an error message
 */
export function getTranslationKeyFromMessage(message: string): TranslationKey | null {
  const normalizedMessage = message.toLowerCase().trim();
  return ERROR_MESSAGE_TO_KEY[normalizedMessage] ?? null;
}

/**
 * Translate an error message to the current locale
 */
export function translateErrorMessage(
  message: string,
  fallbackKey: TranslationKey = 'common.internalError'
): string {
  const key = getTranslationKeyFromMessage(message);
  if (key) {
    return t(key);
  }
  return t(fallbackKey);
}

// ============================================
// LOCALE HELPERS
// ============================================

/**
 * Check if a locale is supported
 */
export function isValidLocale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}

/**
 * Parse and validate a locale string
 */
export function parseLocale(value: string | undefined): SupportedLocale {
  if (!value) {
    return DEFAULT_LOCALE;
  }

  if (isValidLocale(value)) {
    return value;
  }

  const primaryLocale = value.split(',')[0]?.split('-')[0]?.toLowerCase();
  if (primaryLocale && isValidLocale(primaryLocale)) {
    return primaryLocale;
  }

  return DEFAULT_LOCALE;
}
