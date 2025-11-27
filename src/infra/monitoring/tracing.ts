// IMPORTANT: This file must NOT import any application modules (config, logger, etc.)
// OpenTelemetry SDK must be initialized BEFORE any other modules are loaded
// to properly instrument HTTP, database, and other libraries.

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

let sdk: NodeSDK | null = null;

/**
 * Parse OTLP headers from config string
 * Format: "key=value,key2=value2"
 */
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

// Global flag to prevent double initialization
declare global {
  var __otelInitialized: boolean | undefined;
}

/**
 * Initialize OpenTelemetry SDK
 * Must be called AFTER dotenv.config() has loaded environment variables
 */
export function initializeTracing(): void {
  // Skip if already initialized (e.g., by instrumentation.ts via --import)
  if (globalThis.__otelInitialized) {
    // eslint-disable-next-line no-console
    console.log('[OTEL] OpenTelemetry already initialized, skipping');
    return;
  }

  // Read env vars at runtime (after dotenv.config() has run)
  const OTEL_ENABLED = process.env.OTEL_ENABLED === 'true';
  const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const OTEL_EXPORTER_OTLP_HEADERS = process.env.OTEL_EXPORTER_OTLP_HEADERS;
  const SERVICE_NAME = process.env.SERVICE_NAME || 'microservice';
  const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';
  const NODE_ENV = process.env.NODE_ENV || 'development';
  const OTEL_DEBUG = process.env.OTEL_DEBUG === 'true';

  if (!OTEL_ENABLED) {
    // eslint-disable-next-line no-console
    console.log('[OTEL] OpenTelemetry is disabled');
    return;
  }

  if (!OTEL_EXPORTER_OTLP_ENDPOINT) {
    // eslint-disable-next-line no-console
    console.warn('[OTEL] OpenTelemetry enabled but OTEL_EXPORTER_OTLP_ENDPOINT not configured');
    return;
  }

  // Enable debug logging if requested
  if (OTEL_DEBUG) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const headers = parseHeaders(OTEL_EXPORTER_OTLP_HEADERS);

  // Create resource with service info
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    'deployment.environment': NODE_ENV,
  });

  // Create trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    headers,
  });

  // Create metric exporter
  const metricExporter = new OTLPMetricExporter({
    url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
    headers,
  });

  // Create SDK
  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30000, // Export every 30 seconds
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Enable Fastify instrumentation (excluded by default)
        '@opentelemetry/instrumentation-fastify': { enabled: true },
        // Enable HTTP instrumentation
        '@opentelemetry/instrumentation-http': { enabled: true },
        // Disable some noisy instrumentations
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        // Disable pino instrumentation to avoid log export errors (Jaeger doesn't support it)
        '@opentelemetry/instrumentation-pino': { enabled: false },
      }),
    ],
  });

  // Start SDK
  sdk.start();

  // Mark as initialized
  globalThis.__otelInitialized = true;

  // eslint-disable-next-line no-console
  console.log(`[OTEL] 📊 OpenTelemetry initialized - endpoint: ${OTEL_EXPORTER_OTLP_ENDPOINT}`);
}

/**
 * Shutdown OpenTelemetry SDK
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    // eslint-disable-next-line no-console
    console.log('[OTEL] Shutting down OpenTelemetry...');
    await sdk.shutdown();
    // eslint-disable-next-line no-console
    console.log('[OTEL] OpenTelemetry shutdown complete');
  }
}
