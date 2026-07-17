# Microservice Boilerplate

Production-ready Clean Architecture TypeScript microservice template.

## Quick Start

```bash
# Clone/create from template
gh repo create my-service --template berkeerdo/microservice-boilerplate --clone
cd my-service

# Install & configure
npm install
cp .env.example .env

# Start development
docker-compose -f docker-compose.dev.yml up -d  # Redis & RabbitMQ
npm run dev
```

**Access Points:**
- API: http://localhost:3000
- Swagger: http://localhost:3000/docs
- Health: http://localhost:3000/health

## Features

- **Clean Architecture** - Domain-driven design with DI (Awilix)
- **Fastify 5** - High-performance HTTP with Swagger/OpenAPI
- **gRPC** - Protocol buffers support (optional)
- **Security** - Helmet, CORS, distributed rate limiting (Redis), JWT, AES-256-GCM encryption
- **Observability** - OpenTelemetry + Sentry (preloaded via `--import`), Pino logging
- **Resiliency** - Backpressure monitoring, graceful shutdown
- **Infrastructure** - MySQL + Redis caching, RabbitMQ (amqp-resilient), db-bridge migrations
- **i18n** - Internationalization with interpolation support (TR/EN)
- **Transactions** - TransactionManager with automatic cache invalidation (SCAN + UNLINK)

## Project Structure

```
src/
├── app/           # HTTP layer (routes, middlewares, plugins)
├── application/   # Use cases (business logic)
├── domain/        # Business entities and models
├── grpc/          # gRPC handlers and protos
├── infra/         # DB, cache, queue, monitoring
│   └── db/        # TransactionManager, repositories, migrations
├── shared/        # Shared utilities and errors
│   ├── errors/    # AppError classes, error handlers (i18n supported)
│   ├── i18n/      # Internationalization (TR/EN)
│   ├── utils/     # Encryption, helpers
│   └── context/   # RequestContext (AsyncLocalStorage)
└── config/        # Environment configuration
```

## Setup for New Service

1. Update `package.json` with service name
2. Set `MIGRATION_PREFIX` in `.env` (e.g., `keywords`)
3. Update `CLAUDE.md` and `GEMINI.md`
4. Configure gRPC proto files if needed

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development with hot reload (observability preloaded) |
| `npm run build` | Compile TypeScript |
| `npm start` | Production server (observability preloaded) |
| `npm test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run migrate` | Database migrations |
| `npm run migrate:make` | Create new migration |

Requires Node.js >= 22.11 (Node 24 LTS recommended).

## Documentation

- [Quick Start Guide](docs/guides/QUICKSTART.md)
- [Configuration](docs/guides/CONFIGURATION.md)
- [Usage Examples](docs/guides/EXAMPLES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/guides/DEPLOYMENT.md)
- [Scaling](docs/guides/SCALING.md)
- [gRPC Guide](docs/guides/GRPC.md)
- [Observability](docs/guides/OBSERVABILITY.md)
- [Patterns](docs/guides/PATTERNS.md)
- [Database Migrations](docs/guides/DATABASE_MIGRATIONS.md)
- [RabbitMQ](docs/guides/RABBITMQ.md)
- [i18n](docs/guides/I18N.md)

## License

MIT License - see [LICENSE](LICENSE) for details.
