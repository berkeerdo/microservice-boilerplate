# Usage Examples

## Adding a New Endpoint

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

## Using DI Container

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

## Enabling gRPC Server

gRPC is controlled via the `GRPC_ENABLED` environment variable:

```bash
# .env
GRPC_ENABLED=true   # Enable gRPC server (default: false)
GRPC_PORT=50051     # gRPC port
```

The server automatically starts when `GRPC_ENABLED=true`.

```bash
# Test with grpcurl:
grpcurl -plaintext localhost:50051 microservice.ExampleService/ListExamples
```

**Files:**
- Handlers: `src/grpc/handlers/exampleHandler.ts`
- Proto: `src/grpc/protos/service.proto`

## Enabling RabbitMQ Consumer

```typescript
// 1. Set environment variables
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_QUEUE_NAME=my_queue
RABBITMQ_PREFETCH=10

// 2. Consumer handles messages like:
// { "type": "EXAMPLE_CREATED", "payload": { "name": "Test" } }

// 3. Publisher example:
const publisher = new ExamplePublisher(queueConnection);
await publisher.publishExampleCreated({ id: 1, name: 'Test' });
```

## Database Migrations (db-bridge)

```bash
# Create a new migration
npm run migrate:make create_users_table

# Run all pending migrations
npm run migrate

# Rollback last migration batch
npm run migrate:rollback

# Check migration status
npm run migrate:status

# Create a seed file
npm run seed:make users

# Run seeds
npm run seed

# Generate TypeScript types from database
npm run db:types
```

Migration example:

```typescript
import type { Migration, SchemaBuilder } from '@db-bridge/core';

const migration: Migration = {
  name: 'myservice_20260122120000_create_users_table',

  async up(schema: SchemaBuilder): Promise<void> {
    await schema.createTable('users', (table) => {
      table.increments('id');
      table.string('email', 255).unique().notNull();
      table.string('name', 100).notNull();
      table.timestamps();
    });
  },

  async down(schema: SchemaBuilder): Promise<void> {
    await schema.dropTableIfExists('users');
  },
};

export default migration;
```

## Adding Observability

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

## Error Handling

```typescript
// Operational error (user-facing) - message shown to user
throw new ValidationError("Invalid email format");
throw new NotFoundError("User", userId);
throw new UnauthorizedError("Invalid credentials");

// Internal error (programmer error) - generic message
throw new Error("Cannot read properties of undefined");
// → Frontend: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin."
```
