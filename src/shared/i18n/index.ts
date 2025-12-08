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
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { RequestContext } from '../context/index.js';
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
// LOCALE FILES
// ============================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOCALES_DIR = join(__dirname, 'locales');

// ============================================
// TRANSLATION CACHE
// ============================================

type TranslationData = Record<string, Record<string, string>>;

const translationCache = new Map<SupportedLocale, TranslationData>();

/**
 * Load translations for a locale (with caching)
 */
function loadTranslations(locale: SupportedLocale): TranslationData {
  const cached = translationCache.get(locale);
  if (cached) {
    return cached;
  }

  try {
    const filePath = join(LOCALES_DIR, `${locale}.json`);
    const content = readFileSync(filePath, 'utf-8');
    const translations = JSON.parse(content) as TranslationData;
    translationCache.set(locale, translations);
    return translations;
  } catch {
    // Fallback to default locale if file not found
    if (locale !== DEFAULT_LOCALE) {
      return loadTranslations(DEFAULT_LOCALE);
    }
    return {};
  }
}

/**
 * Pre-load all translations at startup
 */
export function preloadTranslations(): void {
  for (const locale of SUPPORTED_LOCALES) {
    loadTranslations(locale);
  }
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
    current = current[part];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Translate a key to the current locale
 *
 * @param key - The translation key (e.g., 'common.internalError')
 * @param locale - Optional locale override (defaults to RequestContext locale)
 * @returns Translated string or the key itself if not found
 */
export function t(key: TranslationKey, locale?: SupportedLocale): string {
  const effectiveLocale = locale ?? RequestContext.getLocale();
  const translations = loadTranslations(effectiveLocale);
  const value = getNestedValue(translations, key);

  if (value) {
    return value;
  }

  // Fallback to default locale
  if (effectiveLocale !== DEFAULT_LOCALE) {
    const defaultTranslations = loadTranslations(DEFAULT_LOCALE);
    const defaultValue = getNestedValue(defaultTranslations, key);
    if (defaultValue) {
      return defaultValue;
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

// Pre-load translations at module load
preloadTranslations();
