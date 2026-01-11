# Kullanım Örnekleri

## Yeni Endpoint Ekleme

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
      // ... kullanıcı getir
    },
  });

  // Korumalı endpoint
  fastify.post('/users', {
    schema: { tags: ['Users'], security: [{ bearerAuth: [] }] },
    preHandler: [
      fastify.authenticate,
      createZodValidator(createUserSchema),
    ],
    handler: async (request, reply) => {
      // request.userId JWT'den mevcut
      // ... kullanıcı oluştur
    },
  });
}

// src/app/routes/index.ts içinde kaydet
fastify.register(userRoutes, { prefix: '/api/v1/users' });
```

## DI Container Kullanımı

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

// Handler'da kullanım
const useCase = container.resolve<CreateUserUseCase>(TOKENS.CreateUserUseCase);
```

## gRPC Sunucusunu Etkinleştirme

gRPC, `GRPC_ENABLED` ortam değişkeni ile kontrol edilir:

```bash
# .env
GRPC_ENABLED=true   # gRPC sunucusunu etkinleştir (varsayılan: false)
GRPC_PORT=50051     # gRPC portu
```

Sunucu `GRPC_ENABLED=true` olduğunda otomatik olarak başlar.

```bash
# grpcurl ile test:
grpcurl -plaintext localhost:50051 microservice.ExampleService/ListExamples
```

**Dosyalar:**
- Handler'lar: `src/grpc/handlers/exampleHandler.ts`
- Proto: `src/grpc/protos/service.proto`

## RabbitMQ Consumer Etkinleştirme

```typescript
// 1. Ortam değişkenlerini ayarla
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_QUEUE_NAME=my_queue
RABBITMQ_PREFETCH=10

// 2. Consumer mesajları şu şekilde işler:
// { "type": "EXAMPLE_CREATED", "payload": { "name": "Test" } }

// 3. Publisher örneği:
const publisher = new ExamplePublisher(queueConnection);
await publisher.publishExampleCreated({ id: 1, name: 'Test' });
```

## Veritabanı Migration'ları (Knex)

```bash
# Yeni migration oluştur
npx knex migrate:make migration_name --knexfile knexfile.ts

# Bekleyen tüm migration'ları çalıştır
npm run migrate

# Son migration batch'ini geri al
npm run migrate:rollback

# Seed dosyası oluştur
npx knex seed:make seed_name --knexfile knexfile.ts

# Seed'leri çalıştır
npm run seed
```

Migration örneği:

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

## Gözlemlenebilirlik Ekleme

```typescript
// .env dosyasında etkinleştir
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
SENTRY_DSN=https://xxx@sentry.io/xxx

// Manuel tracing
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service');
const span = tracer.startSpan('operation-name');
try {
  // ... işlem
} finally {
  span.end();
}

// Manuel hata yakalama
import { captureException } from './infra/monitoring/sentry.js';
captureException(error, { userId: '123' });
```

## Hata Yönetimi

```typescript
// Operasyonel hata (kullanıcıya gösterilen) - mesaj kullanıcıya gösterilir
throw new ValidationError("Geçersiz email formatı");
throw new NotFoundError("User", userId);
throw new UnauthorizedError("Geçersiz kimlik bilgileri");

// Dahili hata (programcı hatası) - genel mesaj
throw new Error("Cannot read properties of undefined");
// → Frontend: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin."
```
