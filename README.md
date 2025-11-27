# Microservice Boilerplate

[Türkçe](README.tr.md) | English

Production-ready Clean Architecture TypeScript microservice template.

## Features

### Architecture
- **Clean Architecture** - Domain-driven design with clear separation
- **Dependency Injection** - tsyringe for IoC container
- **Type-safe Config** - Zod schema validation

### HTTP & API
- **Fastify** - High-performance HTTP server
- **gRPC** - Protocol buffers support (ready to enable)
- **Swagger/OpenAPI** - Auto-generated API documentation
- **Request Validation** - Zod-based validation middleware

### Security
- **Helmet** - Security headers
- **CORS** - Configurable whitelist
- **Rate Limiting** - DoS protection with @fastify/rate-limit
- **JWT Authentication** - Token-based auth with role support

### Observability
- **OpenTelemetry** - Distributed tracing & metrics
- **Sentry** - Error tracking & monitoring
- **Correlation ID** - Request tracing across services
- **Pino Logging** - Structured JSON logs

### Infrastructure
- **MySQL** - With Redis caching layer
- **RabbitMQ** - Message queue support
- **Graceful Shutdown** - Clean resource cleanup
- **Health Checks** - Liveness & readiness probes

### Developer Experience
- **TypeScript** - Full type safety
- **ESLint + Prettier** - Code quality
- **Vitest** - Fast unit testing
- **Docker** - Production-ready containers

## Project Structure

```
src/
├── app/                          # HTTP Layer (Presentation)
│   ├── middlewares/              # Request middlewares
│   │   ├── auth.ts              # JWT authentication
│   │   ├── correlationId.ts     # Request tracing
│   │   ├── rateLimiter.ts       # Rate limiting
│   │   └── requestValidator.ts  # Zod validation
│   ├── plugins/                  # Fastify plugins
│   │   └── swagger.ts           # OpenAPI docs
│   ├── routes/                   # Route handlers
│   └── server.ts                # Server setup
├── application/                  # Application Layer (Use Cases)
│   ├── useCases/                # Business logic operations
│   └── providers/               # External service adapters
├── config/                       # Configuration
│   ├── env.schema.ts            # Zod schema
│   └── env.ts                   # Config loader
├── domain/                       # Domain Layer (Entities)
│   └── models/                  # Business entities
├── grpc/                         # gRPC Layer
│   ├── handlers/                # RPC handlers
│   └── protos/                  # Proto definitions
├── infra/                        # Infrastructure Layer
│   ├── db/                      # Database
│   │   ├── cache/               # Cache key generator
│   │   ├── migrations/          # DB migrations
│   │   └── repositories/        # Data access
│   ├── logger/                  # Pino logger
│   ├── monitoring/              # Observability
│   │   ├── sentry.ts            # Error tracking
│   │   └── tracing.ts           # OpenTelemetry
│   ├── queue/                   # RabbitMQ
│   └── shutdown/                # Graceful shutdown
├── shared/                       # Shared Code
│   ├── errors/                  # Error handling
│   └── utils/                   # Utilities (CircuitBreaker, RetryLogic)
├── container.ts                  # DI setup
└── index.ts                     # Entry point

docs/                             # Documentation
├── en/                           # English docs
│   ├── ARCHITECTURE.md
│   └── guides/
└── tr/                           # Turkish docs
    ├── ARCHITECTURE.md
    └── guides/
```

### Layer Responsibilities

| Layer | Directory | Responsibility |
|-------|-----------|----------------|
| **Presentation** | `app/` | HTTP handlers, middlewares, validation |
| **Application** | `application/` | Use cases, business orchestration |
| **Domain** | `domain/` | Business entities, domain logic |
| **Infrastructure** | `infra/` | DB, cache, queue, monitoring |

## Quick Start

### 1. Create New Service

```bash
cp -r microservice-boilerplate my-new-service
cd my-new-service
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Start Development

```bash
# Start Redis & RabbitMQ
docker-compose -f docker-compose.dev.yml up -d

# Start dev server
npm run dev
```

### 4. Access

- **API**: http://localhost:3000
- **Swagger**: http://localhost:3000/docs
- **Health**: http://localhost:3000/health

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | HTTP port | `3000` |
| `SERVICE_NAME` | Service identifier | `microservice` |
| `JWT_SECRET` | JWT signing key (min 32 chars) | - |
| `RATE_LIMIT_MAX` | Max requests per window | `100` |
| `OTEL_ENABLED` | Enable OpenTelemetry | `false` |
| `SENTRY_DSN` | Sentry project DSN | - |

See `.env.example` for full list.

## Usage Examples

### Adding a New Endpoint

```typescript
// src/app/routes/userRoutes.ts
import { FastifyInstance } from 'fastify';
import { createZodValidator, commonSchemas } from '../middlewares/index.js';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  // Public endpoint
  fastify.get('/users/:id', {
    schema: { tags: ['Users'] },
    preHandler: createZodValidator(commonSchemas.id),
    handler: async (request, reply) => {
      const { id } = request.params as { id: number };
      // ... fetch user
    },
  });

  // Protected endpoint
  fastify.post('/users', {
    schema: { tags: ['Users'], security: [{ bearerAuth: [] }] },
    preHandler: [
      fastify.authenticate,
      createZodValidator(createUserSchema),
    ],
    handler: async (request, reply) => {
      // request.userId available from JWT
      // ... create user
    },
  });
}

// Register in src/app/routes/index.ts
fastify.register(userRoutes, { prefix: '/api/v1/users' });
```

### Using DI Container

```typescript
// src/container.ts
export const TOKENS = {
  UserRepository: 'UserRepository',
  CreateUserUseCase: 'CreateUserUseCase',
} as const;

export function registerDependencies(): DependencyContainer {
  container.registerSingleton(TOKENS.UserRepository, UserRepository);
  container.register(TOKENS.CreateUserUseCase, {
    useFactory: (c) => new CreateUserUseCase(
      c.resolve(TOKENS.UserRepository),
      c.resolve(TOKENS.Logger)
    ),
  });
  return container;
}

// Usage in handler
const useCase = container.resolve<CreateUserUseCase>(TOKENS.CreateUserUseCase);
```

### Adding Observability

```typescript
// Enable in .env
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
SENTRY_DSN=https://xxx@sentry.io/xxx

// Manual tracing
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service');
const span = tracer.startSpan('operation-name');
try {
  // ... operation
} finally {
  span.end();
}

// Manual error capture
import { captureException } from './infra/monitoring/sentry.js';
captureException(error, { userId: '123' });
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Start production |
| `npm test` | Run tests |
| `npm run lint` | Check code style |
| `npm run typecheck` | Type check |

## Docker

### Build

```bash
docker build -t my-service .
```

### Run

```bash
docker-compose up -d
```

## Health Endpoints

### Liveness Probe
```bash
curl http://localhost:3000/health
```

### Readiness Probe
```bash
curl http://localhost:3000/ready
```

## Best Practices

1. **Always use correlation IDs** - Pass `X-Correlation-ID` header between services
2. **Validate all inputs** - Use Zod schemas for request validation
3. **Handle errors properly** - Use custom error classes from `shared/errors`
4. **Log with context** - Include correlationId in all logs
5. **Test critical paths** - Write tests for use cases and handlers

## Documentation

- [Architecture Overview](docs/en/ARCHITECTURE.md)
- [Extending Guide](docs/en/guides/EXTENDING.md)
- [Design Patterns](docs/en/guides/PATTERNS.md)

## License

UNLICENSED
