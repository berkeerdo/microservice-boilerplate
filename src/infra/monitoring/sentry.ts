import * as Sentry from '@sentry/node';
import type { SamplingContext } from '@sentry/core';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import config from '../../config/env.js';
import logger from '../logger/logger.js';

/**
 * Type-safe interface for sampling context
 * Extends Sentry's built-in type with explicit typing for attributes
 */
interface SafeSamplingContext {
  name?: string;
  parentSampled?: boolean;
  attributes?: Record<string, unknown>;
}

let isInitialized = false;

/**
 * Get default sample rate based on environment
 * Best practices from Sentry docs:
 * - Development: 1.0 (100%) for full visibility during debugging
 * - Staging: 0.2 (20%) for testing with realistic sampling
 * - Production: 0.05-0.1 (5-10%) to balance cost and insights
 *
 * @see https://docs.sentry.io/platforms/javascript/configuration/sampling/
 */
function getDefaultSampleRate(): number {
  switch (config.NODE_ENV) {
    case 'development':
      return 1.0; // 100% - see all transactions during dev
    case 'staging':
      return 0.2; // 20% - moderate sampling for testing
    case 'production':
      return 0.05; // 5% - cost-effective for high traffic
    default:
      return 0.1;
  }
}

/**
 * Extract URL from sampling context for filtering decisions
 */
function extractUrlFromContext(ctx: SafeSamplingContext): string {
  const { name, attributes } = ctx;

  // Prefer transaction name
  if (name) return name;

  // Fallback to http.target attribute if available
  if (attributes && 'http.target' in attributes) {
    const target = attributes['http.target'];
    if (typeof target === 'string') return target;
  }

  return '';
}

/**
 * Check if URL matches any of the given patterns
 */
function urlMatchesPatterns(url: string, patterns: string[]): boolean {
  return patterns.some((pattern) => url.includes(pattern));
}

/**
 * Smart traces sampler function
 * Applies different sample rates based on transaction type/importance
 *
 * @see https://docs.sentry.io/platforms/javascript/configuration/sampling/
 */
function tracesSampler(samplingContext: SamplingContext): number {
  // Cast to our safe interface to avoid Sentry's problematic type definitions
  const ctx = samplingContext as unknown as SafeSamplingContext;
  const { parentSampled } = ctx;

  // Inherit parent sampling decision for distributed tracing
  if (parentSampled !== undefined) {
    return parentSampled ? 1.0 : 0;
  }

  const url = extractUrlFromContext(ctx);

  // Health check endpoints - never sample (noise)
  if (urlMatchesPatterns(url, ['/health', '/ready', '/status'])) {
    return 0;
  }

  // Metrics/monitoring endpoints - never sample
  if (urlMatchesPatterns(url, ['/metrics', '/_'])) {
    return 0;
  }

  // Use configured rate or environment default
  const configuredRate = config.SENTRY_TRACES_SAMPLE_RATE;
  if (configuredRate !== undefined && configuredRate >= 0) {
    return configuredRate;
  }

  return getDefaultSampleRate();
}

/**
 * Initialize Sentry error tracking and performance monitoring
 *
 * Features:
 * - Error tracking with stack traces
 * - Performance monitoring (transactions)
 * - Database query tracking (MySQL)
 * - Redis operation tracking
 * - HTTP request/response tracking
 * - Profiling for slow transactions
 * - Smart sampling based on environment and endpoint
 *
 * @see https://docs.sentry.io/platforms/node/
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

  const effectiveSampleRate = config.SENTRY_TRACES_SAMPLE_RATE ?? getDefaultSampleRate();

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT || config.NODE_ENV,
    release: `${config.SERVICE_NAME}@${config.SERVICE_VERSION}`,

    // Smart sampling based on transaction type
    tracesSampler,

    // Profile transactions at same rate as traces
    profilesSampleRate: effectiveSampleRate,

    // Don't send errors in test environment
    enabled: config.NODE_ENV !== 'test',

    // Integrations for full observability
    integrations: [
      // Console error capture
      Sentry.captureConsoleIntegration({ levels: ['error', 'warn'] }),

      // HTTP tracking (incoming & outgoing requests)
      Sentry.httpIntegration({ spans: true }),

      // MySQL query tracking
      Sentry.mysqlIntegration(),

      // Redis operation tracking
      Sentry.redisIntegration(),

      // Profiling for slow transactions
      nodeProfilingIntegration(),
    ],

    // Before sending error, add extra context
    beforeSend(event) {
      event.tags = {
        ...event.tags,
        service: config.SERVICE_NAME,
        environment: config.NODE_ENV,
      };
      return event;
    },

    // Before sending transaction, add context
    beforeSendTransaction(event) {
      event.tags = {
        ...event.tags,
        service: config.SERVICE_NAME,
      };
      return event;
    },
  });

  isInitialized = true;
  logger.info(
    `🔍 Sentry initialized (env: ${config.NODE_ENV}, traces: ${effectiveSampleRate * 100}%)`
  );
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
