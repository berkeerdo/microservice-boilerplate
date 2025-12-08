/**
 * RequestContext - Request-scoped data storage using AsyncLocalStorage
 *
 * This is the recommended pattern for passing cross-cutting concerns
 * (like locale, user info, trace IDs) through the request lifecycle
 * without polluting function signatures.
 *
 * Usage:
 *   // In interceptor/middleware:
 *   RequestContext.run({ locale: 'tr' }, () => handleRequest());
 *
 *   // Anywhere in the call stack:
 *   const locale = RequestContext.getLocale(); // 'tr'
 *
 * @see https://nodejs.org/api/async_context.html
 */
import { AsyncLocalStorage } from 'async_hooks';

// ============================================
// TYPES
// ============================================

export type SupportedLocale = 'tr' | 'en';

export interface RequestContextData {
  /** User's preferred language */
  locale: SupportedLocale;
  /** Request trace ID for distributed tracing (optional) */
  traceId?: string;
  /** Authenticated user ID (optional) */
  userId?: number;
}

// ============================================
// ASYNC LOCAL STORAGE INSTANCE
// ============================================

const asyncLocalStorage = new AsyncLocalStorage<RequestContextData>();

// ============================================
// REQUEST CONTEXT API
// ============================================

export const RequestContext = {
  /**
   * Run a function within a request context
   * All code executed within the callback will have access to the context
   */
  run<T>(context: RequestContextData, fn: () => T): T {
    return asyncLocalStorage.run(context, fn);
  },

  /**
   * Run an async function within a request context
   */
  runAsync<T>(context: RequestContextData, fn: () => Promise<T>): Promise<T> {
    return asyncLocalStorage.run(context, fn);
  },

  /**
   * Get the current request context (or undefined if not in a context)
   */
  get(): RequestContextData | undefined {
    return asyncLocalStorage.getStore();
  },

  /**
   * Get the current locale (defaults to 'tr' if not in context)
   */
  getLocale(): SupportedLocale {
    return asyncLocalStorage.getStore()?.locale ?? 'tr';
  },

  /**
   * Get the current trace ID (if available)
   */
  getTraceId(): string | undefined {
    return asyncLocalStorage.getStore()?.traceId;
  },

  /**
   * Get the current user ID (if available)
   */
  getUserId(): number | undefined {
    return asyncLocalStorage.getStore()?.userId;
  },

  /**
   * Parse locale from string (validates and defaults to 'tr')
   */
  parseLocale(value: string | undefined): SupportedLocale {
    if (value === 'en' || value === 'tr') {
      return value;
    }
    // Handle Accept-Language style values like "en-US,en;q=0.9"
    if (value?.startsWith('en')) {
      return 'en';
    }
    if (value?.startsWith('tr')) {
      return 'tr';
    }
    return 'tr'; // Default
  },
};

export default RequestContext;
