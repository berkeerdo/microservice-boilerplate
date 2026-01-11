# Architecture Overview

This boilerplate follows **Clean Architecture** principles. Goal: testable, maintainable, and framework-agnostic structure.

## Layer Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    External World                           │
│              (HTTP, gRPC, Queue, CLI)                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   PRESENTATION LAYER                        │
│                      (src/app/)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Routes    │  │ Middlewares │  │      Plugins        │ │
│  │  handlers   │  │  auth, cors │  │  swagger, helmet    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER                         │
│                   (src/application/)                        │
│  ┌─────────────────────┐  ┌───────────────────────────────┐│
│  │      Use Cases      │  │         Providers             ││
│  │   Business Logic    │  │   External Service Adapters   ││
│  │ CreateUser, GetUser │  │   Email, Payment, Storage     ││
│  └─────────────────────┘  └───────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     DOMAIN LAYER                            │
│                     (src/domain/)                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                      Entities                           ││
│  │              Business Objects & Rules                   ││
│  │                  User, Order, Product                   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  INFRASTRUCTURE LAYER                       │
│                      (src/infra/)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │    DB    │ │  Queue   │ │  Logger  │ │   Monitoring   │ │
│  │  MySQL   │ │ RabbitMQ │ │   Pino   │ │ Sentry, OTEL   │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Dependency Rule

**Dependencies always flow inward:**

- `app/` → `application/` → `domain/` ✅
- `domain/` → `application/` ❌ FORBIDDEN
- `application/` → `app/` ❌ FORBIDDEN

Domain layer should have no dependencies.

## Folder Descriptions

### `src/app/` - Presentation Layer

Handles HTTP/gRPC requests and responses. **Framework-specific** code lives here.

| Folder | Purpose |
|--------|---------|
| `routes/` | Endpoint definitions and handlers |
| `middlewares/` | Auth, validation, rate limiting |
| `plugins/` | Fastify plugins (swagger, helmet) |

```typescript
// routes/userRoutes.ts
fastify.post('/users', {
  handler: async (request) => {
    const useCase = container.resolve(CreateUserUseCase);
    return useCase.execute(request.body);
  }
});
```

### `src/application/` - Application Layer

**Use Cases** (business logic operations) live here. Orchestration layer.

| Folder | Purpose |
|--------|---------|
| `useCases/` | One class per business operation |
| `providers/` | External service adapters |

```typescript
// useCases/CreateUserUseCase.ts
export class CreateUserUseCase extends BaseUseCase<CreateUserInput, User> {
  constructor(
    private userRepo: IUserRepository,
    private emailProvider: IEmailProvider,
    logger: Logger
  ) {
    super(logger);
  }

  async execute(input: CreateUserInput): Promise<User> {
    const user = await this.userRepo.create(input);
    await this.emailProvider.sendWelcome(user.email);
    return user;
  }
}
```

### `src/domain/` - Domain Layer

**Pure business entities**. NO framework or infrastructure dependencies.

```typescript
// models/User.ts
export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}
```

### `src/infra/` - Infrastructure Layer

Communication with the external world. Database, cache, queue, monitoring.

| Folder | Purpose |
|--------|---------|
| `db/repositories/` | Data access layer |
| `db/cache/` | Cache key generation |
| `db/migrations/` | Database migrations |
| `logger/` | Pino structured logging |
| `monitoring/` | Sentry + OpenTelemetry |
| `queue/` | RabbitMQ integration |
| `shutdown/` | Graceful shutdown handling |

## Dependency Injection

IoC container managed using `awilix` (decorator-free, no reflect-metadata required):

```typescript
// container.ts
import { createContainer, asValue, asClass, asFunction, InjectionMode } from 'awilix';

export const TOKENS = {
  UserRepository: 'userRepository',
  CreateUserUseCase: 'createUserUseCase',
};

export const container = createContainer({
  injectionMode: InjectionMode.PROXY,
  strict: true,
});

export function registerDependencies() {
  container.register({
    logger: asValue(logger),
    userRepository: asClass(UserRepository).singleton(),
    createUserUseCase: asFunction(
      ({ userRepository, logger }) => new CreateUserUseCase(userRepository, logger)
    ).transient(),
  });
}
```

## Request Flow

```
HTTP Request
     │
     ▼
┌─────────────────┐
│  Correlation ID │ ← Unique ID per request
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Rate Limiter  │ ← DoS protection
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  JWT Auth       │ ← Token validation
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Validation     │ ← Zod schema validation
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Route Handler  │ ← Use Case invocation
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Use Case     │ ← Business logic
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Repository    │ ← Data access (cached)
└────────┬────────┘
         │
         ▼
    HTTP Response
```

## Why This Structure?

| Advantage | Description |
|-----------|-------------|
| **Testability** | Use Cases can be tested with mock repositories |
| **Flexibility** | Replacing Fastify with Express only affects `app/` layer |
| **Maintainability** | Each layer has clear responsibilities |
| **Scalability** | Adding new features is straightforward |
