/**
 * Observability bootstrap: Sentry + OpenTelemetry
 *
 * This file must be loaded BEFORE any other application code:
 *   node --import ./dist/instrumentation.js dist/index.js
 * In dev: tsx watch --import ./src/instrumentation.ts src/index.ts
 *
 * This is the SINGLE SOURCE of Sentry + OpenTelemetry configuration.
 * Sentry must initialize here (not in main()) so its module instrumentation
 * attaches before http/mysql/redis are loaded by application code.
 *
 * When both are enabled, Sentry's sampler/processor/propagator are wired into
 * the app-owned NodeSDK per the official custom-setup guide:
 * https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup/
 */

// Load env vars before anything else (env.ts also self-loads dotenv on import)
import dotenv from 'dotenv';
dotenv.config();

import packageJson from '../package.json' with { type: 'json' };
import * as Sentry from '@sentry/node';
import { SentrySampler, SentrySpanProcessor, SentryPropagator } from '@sentry/opentelemetry';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { FastifyOtelInstrumentation } from '@fastify/otel';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { initializeSentry } from './infra/monitoring/sentry.js';

// ============================================
// TYPES
// ============================================

// Global type declaration for SDK reference
declare global {
  var __otelSdk: NodeSDK | undefined;
}

// ============================================
// CONFIG
// ============================================

const OTEL_ENABLED = process.env.OTEL_ENABLED === 'true';
const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const OTEL_EXPORTER_OTLP_HEADERS = process.env.OTEL_EXPORTER_OTLP_HEADERS;
const SERVICE_NAME = process.env.SERVICE_NAME || 'microservice';
const SERVICE_VERSION = packageJson.version;
const NODE_ENV = process.env.NODE_ENV || 'development';

const otelActive = OTEL_ENABLED && Boolean(OTEL_EXPORTER_OTLP_ENDPOINT);

// ============================================
// SENTRY (must run before app modules load)
// ============================================

initializeSentry({ skipOpenTelemetrySetup: otelActive });

// ============================================
// HELPERS
// ============================================

function parseHeaders(headersString?: string): Record<string, string> {
  if (!headersString) {
    return {};
  }
  const headers: Record<string, string> = {};
  for (const pair of headersString.split(',')) {
    const [key, value] = pair.split('=');
    if (key && value) {
      headers[key.trim()] = value.trim();
    }
  }
  return headers;
}

// ============================================
// OPENTELEMETRY INITIALIZATION
// ============================================

if (otelActive) {
  const headers = parseHeaders(OTEL_EXPORTER_OTLP_HEADERS);

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    'deployment.environment': NODE_ENV,
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    headers,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
    headers,
  });

  // When Sentry is active alongside OTel, bridge its sampler/processor/propagator
  // into the app-owned SDK so both backends receive consistent spans
  const sentryClient = Sentry.getClient();

  const sdk = new NodeSDK({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(traceExporter),
      ...(sentryClient ? [new SentrySpanProcessor()] : []),
    ],
    ...(sentryClient
      ? {
          sampler: new SentrySampler(sentryClient),
          textMapPropagator: new SentryPropagator(),
          contextManager: new Sentry.SentryContextManager(),
        }
      : {}),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 30000,
      }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        // @opentelemetry/instrumentation-fastify was removed upstream (Mar 2026);
        // Fastify tracing is provided by @fastify/otel below
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: false },
      }),
      // registerOnInitialization hooks every Fastify instance automatically
      new FastifyOtelInstrumentation({ registerOnInitialization: true }),
    ],
  });

  sdk.start();

  if (sentryClient) {
    Sentry.validateOpenTelemetrySetup();
  }

  // Store SDK globally for shutdown access
  globalThis.__otelSdk = sdk;

  // eslint-disable-next-line no-console
  console.log(`[OTEL] 📊 OpenTelemetry initialized - endpoint: ${OTEL_EXPORTER_OTLP_ENDPOINT}`);
} else {
  // eslint-disable-next-line no-console
  console.log('[OTEL] OpenTelemetry is disabled or not configured');
}

// ============================================
// SHUTDOWN (exported for use in index.ts)
// ============================================

/**
 * Shutdown OpenTelemetry SDK gracefully
 * Call this in your graceful shutdown handler
 */
export async function shutdownTracing(): Promise<void> {
  if (globalThis.__otelSdk) {
    // eslint-disable-next-line no-console
    console.log('[OTEL] Shutting down OpenTelemetry...');
    await globalThis.__otelSdk.shutdown();
    // eslint-disable-next-line no-console
    console.log('[OTEL] OpenTelemetry shutdown complete');
  }
}
