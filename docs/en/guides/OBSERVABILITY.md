# Observability Guide

This guide covers monitoring, tracing, and error tracking using OpenTelemetry, Prometheus, and Sentry.

## The Three Pillars of Observability

| Pillar | Tool | Purpose |
|--------|------|---------|
| **Metrics** | OpenTelemetry + Prometheus | Quantitative measurements (latency, throughput, errors) |
| **Traces** | OpenTelemetry + Jaeger | Request flow across services |
| **Logs** | Pino + ELK/Loki | Event records with context |

## OpenTelemetry

### Overview

OpenTelemetry (OTel) provides a vendor-neutral standard for:
- **Traces**: Distributed request tracking
- **Metrics**: Application measurements
- **Logs**: Contextual event records (coming soon to Node.js)

### Configuration

```bash
# .env
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer token123
```

### Initialization

```typescript
// src/infra/monitoring/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';

export function initializeTracing(): void {
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: config.SERVICE_VERSION,
    [ATTR_DEPLOYMENT_ENVIRONMENT]: config.NODE_ENV,
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
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
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  sdk.start();
}
```

### Auto-Instrumentation

The SDK automatically instruments:
- HTTP/HTTPS requests (incoming and outgoing)
- Express/Fastify frameworks
- MySQL, PostgreSQL, Redis, MongoDB
- gRPC calls
- And more...

### Manual Instrumentation

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service');

async function processOrder(orderId: string) {
  // Create a span for the operation
  return tracer.startActiveSpan('process-order', async (span) => {
    try {
      // Add attributes
      span.setAttribute('order.id', orderId);
      span.setAttribute('order.type', 'standard');

      // Add event
      span.addEvent('Order validated');

      const result = await orderService.process(orderId);

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Custom Metrics

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('my-service');

// Counter - for counting events
const requestCounter = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests',
});

// Histogram - for measuring distributions
const latencyHistogram = meter.createHistogram('http_request_duration_ms', {
  description: 'HTTP request latency in milliseconds',
});

// Gauge - for current values
const activeConnections = meter.createObservableGauge('active_connections', {
  description: 'Number of active connections',
});

// Usage
requestCounter.add(1, { method: 'GET', route: '/api/users' });
latencyHistogram.record(45.2, { method: 'GET', route: '/api/users' });
```

## Prometheus Metrics

### Endpoint

The service exposes metrics at `/metrics`:

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/users",status="200"} 1234

# HELP http_request_duration_ms HTTP request latency
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{le="50"} 980
http_request_duration_ms_bucket{le="100"} 1150
http_request_duration_ms_sum 45678
http_request_duration_ms_count 1234
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'microservice'
    static_configs:
      - targets: ['microservice:3000']
    metrics_path: /metrics
```

### Key Metrics to Monitor

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total requests by method, route, status |
| `http_request_duration_ms` | Histogram | Request latency distribution |
| `db_query_duration_ms` | Histogram | Database query latency |
| `cache_hit_total` | Counter | Cache hits vs misses |
| `active_connections` | Gauge | Current active connections |
| `process_cpu_seconds_total` | Counter | CPU usage |
| `process_resident_memory_bytes` | Gauge | Memory usage |

## Sentry Error Tracking

### Configuration

```bash
# .env
SENTRY_DSN=https://xxx@sentry.io/123
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

### Initialization

```typescript
// src/infra/monitoring/sentry.ts
import * as Sentry from '@sentry/node';

export function initializeSentry(): void {
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT,
    release: `${config.SERVICE_NAME}@${config.SERVICE_VERSION}`,
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,
    enabled: config.NODE_ENV !== 'test',

    integrations: [
      Sentry.captureConsoleIntegration({ levels: ['error', 'warn'] }),
    ],

    beforeSend(event) {
      event.tags = {
        ...event.tags,
        service: config.SERVICE_NAME,
      };
      return event;
    },
  });
}
```

### Capturing Errors

```typescript
import { captureException, captureMessage, addBreadcrumb } from '../infra/monitoring/sentry.js';

try {
  await riskyOperation();
} catch (error) {
  // Capture with context
  captureException(error, {
    userId: user.id,
    operation: 'riskyOperation',
    input: sanitizedInput,
  });
}

// Capture messages
captureMessage('User reached rate limit', 'warning', {
  userId: user.id,
  limit: 100,
});

// Add breadcrumbs for debugging
addBreadcrumb({
  category: 'auth',
  message: 'User logged in',
  level: 'info',
  data: { userId: user.id },
});
```

### User Context

```typescript
import { setUser, clearUser } from '../infra/monitoring/sentry.js';

// On login
setUser({
  id: user.id,
  email: user.email,
  username: user.username,
});

// On logout
clearUser();
```

## Logging

### Structured Logging with Pino

```typescript
// src/infra/logger/logger.ts
import pino from 'pino';

const logger = pino({
  level: config.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: config.SERVICE_NAME,
    version: config.SERVICE_VERSION,
    env: config.NODE_ENV,
  },
});

export default logger;
```

### Log Levels

| Level | When to Use |
|-------|-------------|
| `fatal` | Application cannot continue |
| `error` | Operation failed |
| `warn` | Unexpected but handled |
| `info` | Important business events |
| `debug` | Development debugging |
| `trace` | Detailed flow tracing |

### Correlation IDs

```typescript
// Middleware to add correlation ID
fastify.addHook('onRequest', (request, reply, done) => {
  const correlationId = request.headers['x-correlation-id'] || uuidv4();
  request.correlationId = correlationId;
  reply.header('x-correlation-id', correlationId);

  // Add to logger context
  request.log = logger.child({ correlationId });
  done();
});
```

## Distributed Tracing Setup

### Local Development with Jaeger

```yaml
# docker-compose.observability.yml
version: '3.8'

services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "4318:4318"    # OTLP HTTP
    environment:
      - COLLECTOR_OTLP_ENABLED=true

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  grafana_data:
```

```bash
# Start observability stack
docker-compose -f docker-compose.observability.yml up -d

# Access:
# - Jaeger UI: http://localhost:16686
# - Prometheus: http://localhost:9090
# - Grafana: http://localhost:3001
```

## Dashboards

### Grafana Dashboard Panels

**Request Rate**
```promql
rate(http_requests_total[5m])
```

**Error Rate**
```promql
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
```

**P99 Latency**
```promql
histogram_quantile(0.99, rate(http_request_duration_ms_bucket[5m]))
```

**Memory Usage**
```promql
process_resident_memory_bytes / 1024 / 1024
```

## Alerting

### Prometheus Alert Rules

```yaml
# alerts.yml
groups:
  - name: microservice
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is above 1% for 5 minutes"

      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_ms_bucket[5m])) > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"
          description: "P99 latency is above 1 second"

      - alert: ServiceDown
        expr: up{job="microservice"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service is down"
```

## Best Practices

### 1. Sampling
- Use sampling for high-traffic services
- 100% for errors, 10% for success in production

### 2. Sensitive Data
- Never log passwords, tokens, or PII
- Sanitize request/response bodies
- Use allowlists for logged fields

### 3. Context Propagation
- Always propagate trace context
- Include correlation IDs in all logs
- Link spans to parent traces

### 4. Resource Limits
- Set memory limits for exporters
- Use batching for high-volume telemetry
- Configure appropriate flush intervals

### 5. Graceful Shutdown
```typescript
gracefulShutdown.register('telemetry', async () => {
  await flushSentry();
  await shutdownTracing();
});
```

## References

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [OpenTelemetry Node.js](https://opentelemetry.io/docs/languages/js/)
- [Sentry Node.js SDK](https://docs.sentry.io/platforms/node/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
- [Distributed Tracing Patterns](https://microservices.io/patterns/observability/distributed-tracing.html)
