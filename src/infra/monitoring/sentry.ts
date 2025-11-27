import * as Sentry from '@sentry/node';
import config from '../../config/env.js';
import logger from '../logger/logger.js';

let isInitialized = false;

/**
 * Initialize Sentry error tracking
 */
export function initializeSentry(): void {
  if (!config.SENTRY_DSN) {
    logger.info('Sentry DSN not configured, error tracking disabled');
    return;
  }

  if (isInitialized) {
    logger.warn('Sentry already initialized');
    return;
  }

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT || config.NODE_ENV,
    release: `${config.SERVICE_NAME}@${config.SERVICE_VERSION}`,
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,

    // Don't send errors in test environment
    enabled: config.NODE_ENV !== 'test',

    // Integrations
    integrations: [
      // Automatically capture unhandled promise rejections
      Sentry.captureConsoleIntegration({ levels: ['error', 'warn'] }),
    ],

    // Before sending, add extra context
    beforeSend(event) {
      // Add service context
      event.tags = {
        ...event.tags,
        service: config.SERVICE_NAME,
        environment: config.NODE_ENV,
      };

      return event;
    },
  });

  isInitialized = true;
  logger.info('🔍 Sentry error tracking initialized');
}

/**
 * Capture an exception manually
 */
export function captureException(error: Error, context?: Record<string, unknown>): string {
  if (!isInitialized) {
    logger.error({ err: error, context }, 'Error captured but Sentry not initialized');
    return '';
  }

  return Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a message
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, unknown>
): string {
  if (!isInitialized) {
    logger.info({ message, level, context }, 'Message captured but Sentry not initialized');
    return '';
  }

  return Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string; email?: string; username?: string }): void {
  if (isInitialized) {
    Sentry.setUser(user);
  }
}

/**
 * Clear user context
 */
export function clearUser(): void {
  if (isInitialized) {
    Sentry.setUser(null);
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
  if (isInitialized) {
    Sentry.addBreadcrumb(breadcrumb);
  }
}

/**
 * Flush pending events before shutdown
 */
export async function flushSentry(timeout = 2000): Promise<boolean> {
  if (!isInitialized) return true;

  logger.info('Flushing Sentry events...');
  return Sentry.flush(timeout);
}

/**
 * Close Sentry client
 */
export async function closeSentry(): Promise<void> {
  if (isInitialized) {
    await Sentry.close();
    isInitialized = false;
    logger.info('Sentry closed');
  }
}
