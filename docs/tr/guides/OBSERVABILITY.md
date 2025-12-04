# Observability Rehberi

Bu rehber, OpenTelemetry, Prometheus ve Sentry kullanarak monitoring, tracing ve error tracking konularını kapsar.

## Observability'nin Üç Temeli

| Temel | Araç | Amaç |
|-------|------|------|
| **Metrikler** | OpenTelemetry + Prometheus | Sayısal ölçümler (latency, throughput, hatalar) |
| **Trace'ler** | OpenTelemetry + Jaeger | Servisler arası request akışı |
| **Log'lar** | Pino + ELK/Loki | Context'li event kayıtları |

## OpenTelemetry

### Genel Bakış

OpenTelemetry (OTel) şunlar için vendor-neutral bir standart sağlar:
- **Trace'ler**: Dağıtık request takibi
- **Metrikler**: Uygulama ölçümleri
- **Log'lar**: Context'li event kayıtları (Node.js için yakında)

### Yapılandırma

```bash
# .env
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer token123
```

### Başlatma

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

### Otomatik Enstrümantasyon

SDK şunları otomatik olarak instrument eder:
- HTTP/HTTPS request'leri (gelen ve giden)
- Express/Fastify framework'leri
- MySQL, PostgreSQL, Redis, MongoDB
- gRPC çağrıları
- Ve daha fazlası...

### Manuel Enstrümantasyon

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service');

async function processOrder(orderId: string) {
  // Operasyon için span oluştur
  return tracer.startActiveSpan('process-order', async (span) => {
    try {
      // Attribute'lar ekle
      span.setAttribute('order.id', orderId);
      span.setAttribute('order.type', 'standard');

      // Event ekle
      span.addEvent('Sipariş doğrulandı');

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

### Özel Metrikler

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('my-service');

// Counter - event'leri saymak için
const requestCounter = meter.createCounter('http_requests_total', {
  description: 'Toplam HTTP request sayısı',
});

// Histogram - dağılımları ölçmek için
const latencyHistogram = meter.createHistogram('http_request_duration_ms', {
  description: 'HTTP request latency (ms)',
});

// Gauge - anlık değerler için
const activeConnections = meter.createObservableGauge('active_connections', {
  description: 'Aktif bağlantı sayısı',
});

// Kullanım
requestCounter.add(1, { method: 'GET', route: '/api/users' });
latencyHistogram.record(45.2, { method: 'GET', route: '/api/users' });
```

## Prometheus Metrikleri

### Endpoint

Servis metrikleri `/metrics` endpoint'inde sunar:

```
# HELP http_requests_total Toplam HTTP request sayısı
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/users",status="200"} 1234

# HELP http_request_duration_ms HTTP request latency
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{le="50"} 980
http_request_duration_ms_bucket{le="100"} 1150
http_request_duration_ms_sum 45678
http_request_duration_ms_count 1234
```

### Prometheus Yapılandırması

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

### İzlenecek Temel Metrikler

| Metrik | Tip | Açıklama |
|--------|-----|----------|
| `http_requests_total` | Counter | Method, route, status bazında toplam request |
| `http_request_duration_ms` | Histogram | Request latency dağılımı |
| `db_query_duration_ms` | Histogram | Veritabanı sorgu latency'si |
| `cache_hit_total` | Counter | Cache hit vs miss |
| `active_connections` | Gauge | Anlık aktif bağlantılar |
| `process_cpu_seconds_total` | Counter | CPU kullanımı |
| `process_resident_memory_bytes` | Gauge | Memory kullanımı |

## Sentry Hata Takibi & Performans İzleme

### Yapılandırma

```bash
# .env
SENTRY_DSN=https://xxx@sentry.io/123
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1  # Transaction'ların %10'u, test için 1.0 kullanın
```

> **Not:** `SERVICE_VERSION` otomatik olarak `package.json`'dan okunur - yapılandırmaya gerek yok.

### Özellikler

| Özellik | Açıklama |
|---------|----------|
| **Hata Takibi** | Stack trace ve breadcrumb'larla otomatik yakalama |
| **Performans İzleme** | HTTP istek/yanıt süreleri |
| **Veritabanı Takibi** | MySQL sorgu süreleri ve sayıları |
| **Redis Takibi** | Cache işlem süreleri |
| **Profiling** | Yavaş transaction'lar için CPU analizi |

### Başlatma

```typescript
// src/infra/monitoring/sentry.ts
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export function initializeSentry(): void {
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT || config.NODE_ENV,
    release: `${config.SERVICE_NAME}@${config.SERVICE_VERSION}`,

    // Performans İzleme
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,
    profilesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,

    enabled: config.NODE_ENV !== 'test',

    // Tam gözlemlenebilirlik entegrasyonları
    integrations: [
      // Console hata yakalama
      Sentry.captureConsoleIntegration({ levels: ['error', 'warn'] }),

      // HTTP takibi (gelen & giden istekler)
      Sentry.httpIntegration({ spans: true }),

      // MySQL sorgu takibi
      Sentry.mysqlIntegration(),

      // Redis işlem takibi
      Sentry.redisIntegration(),

      // Yavaş transaction'lar için profiling
      nodeProfilingIntegration(),
    ],

    beforeSend(event) {
      event.tags = {
        ...event.tags,
        service: config.SERVICE_NAME,
        environment: config.NODE_ENV,
      };
      return event;
    },

    beforeSendTransaction(event) {
      event.tags = {
        ...event.tags,
        service: config.SERVICE_NAME,
      };
      return event;
    },
  });
}
```

### Sentry Dashboard'da Göreceğiniz

**Performance Sekmesi:**
- Transaction süreleri (örn: `POST /auth/signin` → 45ms)
- Veritabanı sorguları ve süreleri (örn: `SELECT * FROM users` → 12ms)
- Redis işlemleri (örn: `GET cache:user:123` → 2ms)
- Yavaş transaction'lar için CPU profiling flame graph'ları

**Issues Sekmesi:**
- Tam stack trace'li hatalar
- Hata öncesi olayları gösteren breadcrumb'lar
- Kullanıcı context'i (ayarlandıysa)
- Environment ve release tag'leri

### Hata Yakalama

```typescript
import { captureException, captureMessage, addBreadcrumb } from '../infra/monitoring/sentry.js';

try {
  await riskyOperation();
} catch (error) {
  // Context ile yakala
  captureException(error, {
    userId: user.id,
    operation: 'riskyOperation',
    input: sanitizedInput,
  });
}

// Mesaj yakala
captureMessage('Kullanıcı rate limit\'e ulaştı', 'warning', {
  userId: user.id,
  limit: 100,
});

// Debug için breadcrumb ekle
addBreadcrumb({
  category: 'auth',
  message: 'Kullanıcı giriş yaptı',
  level: 'info',
  data: { userId: user.id },
});
```

### Kullanıcı Context'i

```typescript
import { setUser, clearUser } from '../infra/monitoring/sentry.js';

// Giriş yapıldığında
setUser({
  id: user.id,
  email: user.email,
  username: user.username,
});

// Çıkış yapıldığında
clearUser();
```

## Logging

### Pino ile Yapısal Logging

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

### Log Seviyeleri

| Seviye | Ne Zaman Kullanılır |
|--------|---------------------|
| `fatal` | Uygulama devam edemez |
| `error` | Operasyon başarısız |
| `warn` | Beklenmeyen ama ele alındı |
| `info` | Önemli iş olayları |
| `debug` | Geliştirme debug'u |
| `trace` | Detaylı akış takibi |

### Correlation ID'ler

```typescript
// Correlation ID ekleyen middleware
fastify.addHook('onRequest', (request, reply, done) => {
  const correlationId = request.headers['x-correlation-id'] || uuidv4();
  request.correlationId = correlationId;
  reply.header('x-correlation-id', correlationId);

  // Logger context'ine ekle
  request.log = logger.child({ correlationId });
  done();
});
```

## Dağıtık Tracing Kurulumu

### Jaeger ile Lokal Geliştirme

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
# Observability stack'i başlat
docker-compose -f docker-compose.observability.yml up -d

# Erişim:
# - Jaeger UI: http://localhost:16686
# - Prometheus: http://localhost:9090
# - Grafana: http://localhost:3001
```

## Dashboard'lar

### Grafana Dashboard Panel'leri

**Request Rate**
```promql
rate(http_requests_total[5m])
```

**Hata Oranı**
```promql
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
```

**P99 Latency**
```promql
histogram_quantile(0.99, rate(http_request_duration_ms_bucket[5m]))
```

**Memory Kullanımı**
```promql
process_resident_memory_bytes / 1024 / 1024
```

## Alerting

### Prometheus Alert Kuralları

```yaml
# alerts.yml
groups:
  - name: microservice
    rules:
      - alert: YuksekHataOrani
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Yüksek hata oranı tespit edildi"
          description: "Hata oranı 5 dakikadır %1'in üzerinde"

      - alert: YuksekLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_ms_bucket[5m])) > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Yüksek latency tespit edildi"
          description: "P99 latency 1 saniyenin üzerinde"

      - alert: ServisKapali
        expr: up{job="microservice"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Servis kapalı"
```

## En İyi Pratikler

### 1. Sampling
- Yüksek trafikli servisler için sampling kullanın
- Production'da hatalar için %100, başarılı için %10

### 2. Hassas Veri
- Asla şifre, token veya PII loglamayın
- Request/response body'lerini sanitize edin
- Loglanan alanlar için allowlist kullanın

### 3. Context Propagation
- Her zaman trace context'i propagate edin
- Tüm log'lara correlation ID ekleyin
- Span'ları parent trace'lere bağlayın

### 4. Resource Limitleri
- Exporter'lar için memory limitleri ayarlayın
- Yüksek hacimli telemetri için batching kullanın
- Uygun flush interval'ları yapılandırın

### 5. Graceful Shutdown
```typescript
gracefulShutdown.register('telemetry', async () => {
  await flushSentry();
  await shutdownTracing();
});
```

## Kaynaklar

- [OpenTelemetry Dokümantasyonu](https://opentelemetry.io/docs/)
- [OpenTelemetry Node.js](https://opentelemetry.io/docs/languages/js/)
- [Sentry Node.js SDK](https://docs.sentry.io/platforms/node/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [Grafana Dashboard'lar](https://grafana.com/grafana/dashboards/)
- [Dağıtık Tracing Pattern'ları](https://microservices.io/patterns/observability/distributed-tracing.html)
