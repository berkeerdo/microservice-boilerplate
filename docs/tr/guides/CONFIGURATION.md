# Konfigürasyon Rehberi

## Ortam Değişkenleri

### Uygulama

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `NODE_ENV` | Ortam | `development` |
| `PORT` | HTTP portu | `3000` |
| `SERVICE_NAME` | Servis tanımlayıcısı | `microservice` |
| `LOG_LEVEL` | Log seviyesi | `info` |

### Güvenlik

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `JWT_SECRET` | JWT imzalama anahtarı (min 32 karakter) | - |
| `CORS_ORIGINS` | İzin verilen originler (virgülle ayrılmış) | - |
| `RATE_LIMIT_MAX` | Pencere başına maksimum istek | `100` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit penceresi | `60000` |

### Veritabanı

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `DATABASE_HOST` | MySQL host | `localhost` |
| `DATABASE_PORT` | MySQL port | `3306` |
| `DATABASE_USER` | MySQL kullanıcısı | - |
| `DATABASE_PASSWORD` | MySQL şifresi | - |
| `DATABASE_NAME` | MySQL veritabanı | - |

### Redis

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `REDIS_SERVER` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis şifresi | - |

### gRPC

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `GRPC_ENABLED` | gRPC sunucusunu etkinleştir | `false` |
| `GRPC_PORT` | gRPC portu | `50051` |

### RabbitMQ

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `RABBITMQ_URL` | RabbitMQ URL | - |
| `RABBITMQ_QUEUE_NAME` | Kuyruk adı | - |
| `RABBITMQ_PREFETCH` | Prefetch sayısı | `10` |

### Gözlemlenebilirlik

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `OTEL_ENABLED` | OpenTelemetry etkinleştir | `false` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint | - |
| `SENTRY_DSN` | Sentry proje DSN | - |

### Backpressure

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `BACKPRESSURE_ENABLED` | Backpressure etkinleştir | `true` |
| `BACKPRESSURE_MAX_EVENT_LOOP_DELAY` | Max event loop gecikmesi (ms) | `1000` |
| `BACKPRESSURE_MAX_HEAP_USED_BYTES` | Max heap (0 = devre dışı) | `0` |
| `BACKPRESSURE_MAX_RSS_BYTES` | Max RSS (0 = devre dışı) | `0` |
| `BACKPRESSURE_RETRY_AFTER` | Retry-After header (saniye) | `10` |

## Örnek .env Dosyası

```bash
# Uygulama
NODE_ENV=development
PORT=3000
SERVICE_NAME=my-service
LOG_LEVEL=info

# Güvenlik
JWT_SECRET=your-super-secret-key-min-32-characters
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
RATE_LIMIT_MAX=100

# Veritabanı
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=root
DATABASE_PASSWORD=password
DATABASE_NAME=mydb

# Redis
REDIS_SERVER=localhost
REDIS_PORT=6379

# gRPC (opsiyonel)
GRPC_ENABLED=false
GRPC_PORT=50051

# Gözlemlenebilirlik (opsiyonel)
OTEL_ENABLED=false
SENTRY_DSN=
```
