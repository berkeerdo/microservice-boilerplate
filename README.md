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

### High-Load & Resiliency
- **Backpressure Monitoring** - Event loop & memory pressure detection (@fastify/under-pressure)
- **Health Checks** - Comprehensive liveness & readiness probes
- **DB Query Timeouts** - Prevent long-running queries from blocking
- **Graceful Shutdown** - Clean resource cleanup with timeout

### Infrastructure
- **MySQL** - With Redis caching layer (node-caching-mysql-connector-with-redis)
- **Knex Migrations** - Database schema versioning
- **RabbitMQ** - Message queue support (consumer & publisher)

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
│   │   ├── migrations/          # Knex migrations
│   │   ├── seeds/               # Seed data
│   │   └── repositories/        # Data access
│   ├── health/                  # Health checks
│   ├── logger/                  # Pino logger
│   ├── monitoring/              # Observability
│   │   ├── sentry.ts            # Error tracking
│   │   └── tracing.ts           # OpenTelemetry
│   ├── queue/                   # RabbitMQ
│   └── shutdown/                # Graceful shutdown
├── shared/                       # Shared Code
│   └── errors/                  # Centralized error handling
│       ├── AppError.ts          # Custom error classes (isOperational flag)
│       ├── errorHandler.ts      # HTTP middleware
│       ├── errorSanitizer.ts    # Error sanitization for frontend
│       └── index.ts             # Clean exports
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

### Option 1: GitHub Template (Recommended)

Click **"Use this template"** on GitHub, or:

```bash
gh repo create my-new-service --template berkeerdo/microservice-boilerplate --clone
cd my-new-service
npm install
```

### Option 2: Degit (No Git History)

```bash
npx degit berkeerdo/microservice-boilerplate my-new-service
cd my-new-service
npm install
```

### Option 3: Git Clone

```bash
git clone https://github.com/berkeerdo/microservice-boilerplate.git my-new-service
cd my-new-service
rm -rf .git && git init
npm install
```

### Configure

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
import { createZodValidator } from '../middlewares/index.js';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  // Public endpoint
  fastify.get('/users/:id', {
    schema: { tags: ['Users'] },
    preHandler: createZodValidator(idParamSchema),
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

### Enabling gRPC Server

gRPC is controlled via the `GRPC_ENABLED` environment variable:

```bash
# .env
GRPC_ENABLED=true   # Enable gRPC server (default: false)
GRPC_PORT=50051     # gRPC port
```

The server automatically starts when `GRPC_ENABLED=true`:

```typescript
// src/index.ts - handled automatically
if (config.GRPC_ENABLED) {
  await startGrpcServer(config.GRPC_PORT);
  // ... graceful shutdown registered
}
```

```bash
# Test with grpcurl:
grpcurl -plaintext localhost:50051 microservice.ExampleService/ListExamples
```

**Files:**
- Handlers: `src/grpc/handlers/exampleHandler.ts` (uses same Use Cases as HTTP)
- Proto: `src/grpc/protos/service.proto`

### Enabling RabbitMQ Consumer

```typescript
// 1. Set environment variables
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_QUEUE_NAME=my_queue
RABBITMQ_PREFETCH=10

// 2. Uncomment in src/index.ts
const queueConnection = new QueueConnection({
  url: config.RABBITMQ_URL,
  connectionName: 'main',
  prefetch: config.RABBITMQ_PREFETCH,
});
await queueConnection.connect();

const exampleConsumer = new ExampleConsumer(queueConnection, config.RABBITMQ_QUEUE_NAME);
await exampleConsumer.start();

// 3. Consumer handles messages like:
// { "type": "EXAMPLE_CREATED", "payload": { "name": "Test" } }

// 4. Publisher example:
const publisher = new ExamplePublisher(queueConnection);
await publisher.publishExampleCreated({ id: 1, name: 'Test' });
```

### Database Migrations (Knex)

```bash
# Create a new migration
npx knex migrate:make migration_name --knexfile knexfile.ts

# Run all pending migrations
npm run migrate

# Rollback last migration batch
npm run migrate:rollback

# Create a seed file
npx knex seed:make seed_name --knexfile knexfile.ts

# Run seeds
npm run seed
```

Migration example (`src/infra/db/migrations/xxx_create_users.ts`):

```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('email', 255).notNullable().unique();
    table.string('name', 100).notNullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
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
| `npm run migrate` | Run database migrations |
| `npm run migrate:rollback` | Rollback last migration |
| `npm run seed` | Run database seeds |

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

### Backpressure Status
```bash
curl http://localhost:3000/status
```

## Backpressure Monitoring

Protects against server overload by monitoring system resources using `@fastify/under-pressure`:

### How It Works

When the service is under high load, it automatically returns `503 Service Unavailable`:

```
Client Request → Event Loop Check → Memory Check → Process Request
                      ↓                   ↓
                   Delayed?           Over limit?
                      ↓                   ↓
                    503 ←────────────────┘
```

### Configuration

```bash
BACKPRESSURE_ENABLED=true
BACKPRESSURE_MAX_EVENT_LOOP_DELAY=1000    # Max event loop delay (ms)
BACKPRESSURE_MAX_HEAP_USED_BYTES=0        # Max heap (0 = disabled)
BACKPRESSURE_MAX_RSS_BYTES=0              # Max RSS (0 = disabled)
BACKPRESSURE_RETRY_AFTER=10               # Retry-After header (seconds)
```

### Response When Overloaded

```json
{
  "statusCode": 503,
  "error": "Service Unavailable",
  "message": "Service temporarily unavailable due to high load"
}
```

Response includes `Retry-After` header indicating when to retry.

## Error Handling

Error handling is based on `isOperational` flag pattern (Node.js best practice):

### Error Types

| Error Type | isOperational | Frontend Sees |
|------------|---------------|---------------|
| ValidationError | true | Actual message |
| NotFoundError | true | Actual message |
| UnauthorizedError | true | Actual message |
| ForbiddenError | true | Actual message |
| Error (generic) | false | "Beklenmeyen bir hata oluştu..." |
| Programmer errors | false | Generic message |

### Usage

```typescript
// Operational error (user-facing) - message shown to user
throw new ValidationError("Invalid email format");
throw new NotFoundError("User", userId);
throw new UnauthorizedError("Invalid credentials");

// Internal error (programmer error) - generic message
throw new Error("Cannot read properties of undefined");
// → Frontend: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin."
```

### Sanitization

```typescript
import { sanitizeError } from './shared/errors';

// In error handler
const safeMessage = sanitizeError(error);
// Returns actual message for operational errors, generic for others
```

## Best Practices

1. **Always use correlation IDs** - Pass `X-Correlation-ID` header between services
2. **Validate all inputs** - Use Zod schemas for request validation
3. **Handle errors properly** - Use custom error classes from `shared/errors`
4. **Log with context** - Include correlationId in all logs
5. **Test critical paths** - Write tests for use cases and handlers

## Documentation

### English
- [Architecture Overview](docs/en/ARCHITECTURE.md)
- [Deployment Guide](docs/en/guides/DEPLOYMENT.md)
- [Scaling Guide](docs/en/guides/SCALING.md)
- [gRPC Guide](docs/en/guides/GRPC.md)
- [Observability](docs/en/guides/OBSERVABILITY.md)
- [Database Migrations](docs/en/guides/DATABASE_MIGRATIONS.md)
- [Patterns](docs/en/guides/PATTERNS.md)
- [Extending](docs/en/guides/EXTENDING.md)
- [Commit Convention](docs/en/guides/COMMIT-CONVENTION.md)

### Türkçe
- [Mimari](docs/tr/ARCHITECTURE.md)
- [Dağıtım Rehberi](docs/tr/guides/DEPLOYMENT.md)
- [Ölçeklendirme Rehberi](docs/tr/guides/SCALING.md)
- [gRPC Rehberi](docs/tr/guides/GRPC.md)
- [Gözlemlenebilirlik](docs/tr/guides/OBSERVABILITY.md)
- [Güvenlik Altyapısı](docs/tr/guides/SECURITY_INFRASTRUCTURE.md)
- [Patterns](docs/tr/guides/PATTERNS.md)
- [Extending](docs/tr/guides/EXTENDING.md)
- [Commit Convention](docs/tr/guides/COMMIT-CONVENTION.md)

## License

UNLICENSED
