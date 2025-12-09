# Microservice Boilerplate

[Türkçe](README.tr.md) | English

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
- **Fastify** - High-performance HTTP with Swagger/OpenAPI
- **gRPC** - Protocol buffers support (optional)
- **Security** - Helmet, CORS, Rate Limiting, JWT
- **Observability** - OpenTelemetry, Sentry, Pino logging
- **Resiliency** - Backpressure monitoring, graceful shutdown
- **Infrastructure** - MySQL + Redis caching, RabbitMQ, Knex migrations

## Project Structure

```
src/
├── app/           # HTTP layer (routes, middlewares, plugins)
├── application/   # Use cases (business logic)
├── domain/        # Business entities and models
├── grpc/          # gRPC handlers and protos
├── infra/         # DB, cache, queue, monitoring
├── shared/        # Shared utilities and errors
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
| `npm run dev` | Development with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Production server |
| `npm test` | Run tests |
| `npm run migrate` | Database migrations |
| `npm run migrate:make` | Create new migration |

## Documentation

- [Quick Start Guide](docs/en/guides/QUICKSTART.md)
- [Configuration](docs/en/guides/CONFIGURATION.md)
- [Usage Examples](docs/en/guides/EXAMPLES.md)
- [Architecture](docs/en/ARCHITECTURE.md)
- [Deployment](docs/en/guides/DEPLOYMENT.md)
- [Scaling](docs/en/guides/SCALING.md)
- [gRPC Guide](docs/en/guides/GRPC.md)
- [Observability](docs/en/guides/OBSERVABILITY.md)
- [Patterns](docs/en/guides/PATTERNS.md)

### Türkçe
- [Mimari](docs/tr/ARCHITECTURE.md)
- [Dağıtım](docs/tr/guides/DEPLOYMENT.md)
- [Ölçeklendirme](docs/tr/guides/SCALING.md)

## License

UNLICENSED
