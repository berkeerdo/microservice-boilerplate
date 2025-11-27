/**
 * OpenTelemetry Instrumentation
 *
 * This file must be loaded BEFORE any other application code.
 * Use: node --import ./dist/instrumentation.js ./dist/index.js
 * Or in dev: NODE_OPTIONS="--import tsx/esm" tsx --import ./src/instrumentation.ts src/index.ts
 */

// Load env vars before anything else
import dotenv from 'dotenv';
dotenv.config();

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Read env vars directly
const OTEL_ENABLED = process.env.OTEL_ENABLED === 'true';
const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const OTEL_EXPORTER_OTLP_HEADERS = process.env.OTEL_EXPORTER_OTLP_HEADERS;
const SERVICE_NAME = process.env.SERVICE_NAME || 'microservice';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

function parseHeaders(headersString?: string): Record<string, string> {
  if (!headersString) return {};
  const headers: Record<string, string> = {};
  const pairs = headersString.split(',');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      headers[key.trim()] = value.trim();
    }
  }
  return headers;
}

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
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30000,
    }),
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

  // Mark as initialized to prevent double init in tracing.ts
  (globalThis as Record<string, unknown>).__otelInitialized = true;

  // Graceful shutdown
  const shutdown = async () => {
    await sdk.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // eslint-disable-next-line no-console
  console.log(
    `[OTEL] 📊 OpenTelemetry initialized via --import - endpoint: ${OTEL_EXPORTER_OTLP_ENDPOINT}`
  );
} else {
  // eslint-disable-next-line no-console
  console.log('[OTEL] OpenTelemetry is disabled or not configured');
}
