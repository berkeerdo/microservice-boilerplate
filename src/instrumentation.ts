/**
 * OpenTelemetry Instrumentation
 *
 * This file must be loaded BEFORE any other application code.
 * Use: node --import ./dist/instrumentation.js ./dist/index.js
 * Or in dev: NODE_OPTIONS="--import tsx/esm" tsx --import ./src/instrumentation.ts src/index.ts
 *
 * This is the SINGLE SOURCE of OpenTelemetry configuration.
 * Do NOT duplicate this logic elsewhere.
 */

// Load env vars before anything else
import dotenv from 'dotenv';
dotenv.config();

import { readFileSync } from 'fs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// ============================================
// TYPES
// ============================================

interface PackageJson {
  version: string;
  name?: string;
}

// Global type declaration for SDK reference
declare global {
  var __otelSdk: NodeSDK | undefined;
}

// ============================================
// CONFIG
// ============================================

// Read version from package.json (single source of truth)
const pkg: PackageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
) as PackageJson;

const OTEL_ENABLED = process.env.OTEL_ENABLED === 'true';
const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const OTEL_EXPORTER_OTLP_HEADERS = process.env.OTEL_EXPORTER_OTLP_HEADERS;
const SERVICE_NAME = process.env.SERVICE_NAME || 'microservice';
const SERVICE_VERSION = pkg.version;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================
// HELPERS
// ============================================

function parseHeaders(headersString?: string): Record<string, string> {
  if (!headersString) return {};
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
// INITIALIZATION
// ============================================

if (OTEL_ENABLED && OTEL_EXPORTER_OTLP_ENDPOINT) {
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

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    // Use metricReaders (array) instead of deprecated metricReader (singular)
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 30000,
      }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fastify': { enabled: true },
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: false },
      }),
    ],
  });

  sdk.start();

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
