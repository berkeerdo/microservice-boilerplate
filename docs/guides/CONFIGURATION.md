# Configuration Guide

## Environment Variables

### Application

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | HTTP port | `3000` |
| `SERVICE_NAME` | Service identifier | `microservice` |
| `LOG_LEVEL` | Logging level | `info` |

### Security

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing key (min 32 chars) | - |
| `CORS_ORIGINS` | Allowed origins (comma-separated) | - |
| `RATE_LIMIT_MAX` | Max requests per window | `100` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `60000` |

### Database

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_HOST` | MySQL host | `localhost` |
| `DATABASE_PORT` | MySQL port | `3306` |
| `DATABASE_USER` | MySQL user | - |
| `DATABASE_PASSWORD` | MySQL password | - |
| `DATABASE_NAME` | MySQL database | - |

### Redis

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_SERVER` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | - |

### gRPC

| Variable | Description | Default |
|----------|-------------|---------|
| `GRPC_ENABLED` | Enable gRPC server | `false` |
| `GRPC_PORT` | gRPC port | `50051` |

### RabbitMQ

| Variable | Description | Default |
|----------|-------------|---------|
| `RABBITMQ_URL` | RabbitMQ URL | - |
| `RABBITMQ_QUEUE_NAME` | Queue name | - |
| `RABBITMQ_PREFETCH` | Prefetch count | `10` |

### Observability

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_ENABLED` | Enable OpenTelemetry | `false` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint | - |
| `SENTRY_DSN` | Sentry project DSN | - |

### Backpressure

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKPRESSURE_ENABLED` | Enable backpressure | `true` |
| `BACKPRESSURE_MAX_EVENT_LOOP_DELAY` | Max event loop delay (ms) | `1000` |
| `BACKPRESSURE_MAX_HEAP_USED_BYTES` | Max heap (0 = disabled) | `0` |
| `BACKPRESSURE_MAX_RSS_BYTES` | Max RSS (0 = disabled) | `0` |
| `BACKPRESSURE_RETRY_AFTER` | Retry-After header (seconds) | `10` |

## Example .env File

```bash
# Application
NODE_ENV=development
PORT=3000
SERVICE_NAME=my-service
LOG_LEVEL=info

# Security
JWT_SECRET=your-super-secret-key-min-32-characters
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
RATE_LIMIT_MAX=100

# Database
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=root
DATABASE_PASSWORD=password
DATABASE_NAME=mydb

# Redis
REDIS_SERVER=localhost
REDIS_PORT=6379

# gRPC (optional)
GRPC_ENABLED=false
GRPC_PORT=50051

# Observability (optional)
OTEL_ENABLED=false
SENTRY_DSN=
```
