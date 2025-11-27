# Design Patterns Guide

Explanation and usage examples of design patterns used in this boilerplate.

## Circuit Breaker Pattern

**Purpose:** When a service fails, instead of continuously making failing requests, "open the circuit" and fail fast.

**File:** `src/shared/utils/CircuitBreaker.ts`

### State Diagram

```
         ┌──────────────┐
         │    CLOSED    │ ← Normal operation
         │   (Normal)   │
         └──────┬───────┘
                │ failureThreshold exceeded
                ▼
         ┌──────────────┐
         │     OPEN     │ ← All requests rejected
         │   (Failing)  │
         └──────┬───────┘
                │ timeout period passed
                ▼
         ┌──────────────┐
         │  HALF_OPEN   │ ← Test requests
         │  (Testing)   │
         └──────┬───────┘
                │
    ┌───────────┴───────────┐
    │ success               │ failure
    ▼                       ▼
  CLOSED                  OPEN
```

### Usage

```typescript
import { CircuitBreaker } from '../shared/utils/CircuitBreaker.js';

const externalApiBreaker = new CircuitBreaker('external-api', {
  failureThreshold: 5,    // Open after 5 failures
  successThreshold: 2,    // Close after 2 successes
  timeout: 60000,         // Wait 60 seconds
});

async function callExternalApi() {
  return externalApiBreaker.execute(async () => {
    const response = await fetch('https://api.external.com/data');
    if (!response.ok) throw new Error('API failed');
    return response.json();
  });
}
```

### When to Use?

- External API calls
- Database connections
- Message queue operations
- Microservice-to-microservice communication

---

## Retry Pattern

**Purpose:** Automatic retry mechanism for transient failures.

**File:** `src/shared/utils/RetryLogic.ts`

### Usage

```typescript
import { RetryLogic, RetryOptions } from '../shared/utils/RetryLogic.js';

const retryOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,      // 1 second
  maxDelay: 10000,         // 10 seconds max
  backoffMultiplier: 2,    // Exponential backoff
  retryableErrors: [       // Retry only for these errors
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
  ],
};

const retry = new RetryLogic(retryOptions);

async function fetchWithRetry() {
  return retry.execute(async () => {
    const response = await fetch('https://api.example.com');
    return response.json();
  });
}
```

### Exponential Backoff

```
Attempt 1: 1000ms wait
Attempt 2: 2000ms wait
Attempt 3: 4000ms wait (max 10000ms)
```

### Circuit Breaker + Retry Together

```typescript
async function resilientApiCall() {
  return circuitBreaker.execute(async () => {
    return retry.execute(async () => {
      return callExternalApi();
    });
  });
}
```

---

## Repository Pattern

**Purpose:** Separate data access logic from domain logic.

**File:** `src/infra/db/repositories/BaseRepository.ts`

### Interface Definition

```typescript
export interface IRepository<T> {
  findById(id: number): Promise<T | null>;
  findAll(limit?: number, offset?: number): Promise<T[]>;
  create(entity: Partial<T>): Promise<number>;
  update(id: number, entity: Partial<T>): Promise<boolean>;
  delete(id: number): Promise<boolean>;
}
```

### Concrete Implementation

```typescript
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users', 'user'); // tableName, cachePrefix
  }

  // Custom methods
  async findByEmail(email: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE email = ?';
    const results = await this.query(sql, [email]);
    return results[0] || null;
  }
}
```

### Why Repository Pattern?

| Advantage | Description |
|-----------|-------------|
| Testability | Use case can be tested with mock repository |
| Flexibility | Switching from MySQL to PostgreSQL only affects repository |
| Caching | Cache logic centralized in repository |
| Query optimization | SQL optimizations in one place |

---

## Dependency Injection Pattern

**Purpose:** Inject dependencies externally to achieve loose coupling.

**Library:** `awilix` (decorator-free, no reflect-metadata required)

### Container Setup

```typescript
// container.ts
import { createContainer, asValue, asClass, asFunction, InjectionMode } from 'awilix';

export const TOKENS = {
  UserRepository: 'userRepository',
  EmailProvider: 'emailProvider',
  CreateUserUseCase: 'createUserUseCase',
};

export const container = createContainer({
  injectionMode: InjectionMode.PROXY,
  strict: true,
});

export function registerDependencies() {
  container.register({
    userRepository: asClass(UserRepository).singleton(),
    emailProvider: asFunction(() =>
      config.NODE_ENV === 'test'
        ? new MockEmailProvider()
        : new SendGridEmailProvider(config.SENDGRID_API_KEY)
    ).singleton(),
  });
}
```

### Injection Types

```typescript
// 1. Constructor Injection (Recommended)
class CreateUserUseCase {
  constructor(
    private userRepo: IUserRepository,
    private emailProvider: IEmailProvider
  ) {}
}

// 2. Factory Pattern with Awilix
container.register({
  createUserUseCase: asFunction(
    ({ userRepository, emailProvider }) => new CreateUserUseCase(userRepository, emailProvider)
  ).transient(),
});

// 3. Resolution
const useCase = container.resolve<CreateUserUseCase>(TOKENS.CreateUserUseCase);
```

---

## Middleware Pattern

**Purpose:** Add cross-cutting concerns to request/response pipeline.

### Fastify Hook Order

```
onRequest → preParsing → preValidation → preHandler → handler
                                                          │
onSend ← preSerialization ←────────────────────────────────┘
  │
  ▼
onResponse
```

### Custom Middleware Example

```typescript
// Timing middleware
export async function registerTiming(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', async (request) => {
    request.startTime = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - request.startTime;
    request.log.info({ duration }, 'Request completed');
  });
}
```

### Middleware Order (This Boilerplate)

1. **Correlation ID** - Request tracing
2. **Rate Limiter** - DoS protection
3. **JWT Auth** - Authentication
4. **Validation** - Input validation
5. **Handler** - Business logic

---

## Graceful Shutdown Pattern

**Purpose:** Properly close open connections when service shuts down.

**File:** `src/infra/shutdown/gracefulShutdown.ts`

### Shutdown Order

```
SIGTERM received
       │
       ▼
┌──────────────────┐
│ Stop accepting   │
│ new connections  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Wait for active  │
│ requests (30s)   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Close resources: │
│ - HTTP server    │
│ - Database       │
│ - Queue          │
│ - OpenTelemetry  │
│ - Sentry         │
└────────┬─────────┘
         │
         ▼
    Process exit
```

### Usage

```typescript
import { gracefulShutdown } from './infra/shutdown/gracefulShutdown.js';

// Setup signal handlers
gracefulShutdown.setupSignalHandlers();

// Register resources (LIFO order)
gracefulShutdown.register('database', async () => {
  await db.close();
});

gracefulShutdown.register('queue', async () => {
  await queue.close();
});

// Special method for Fastify
gracefulShutdown.registerFastify(server);
```

---

## Error Handling Pattern

**Purpose:** Consistent error responses and centralized error handling.

**File:** `src/shared/errors/errorMapper.ts`

### Custom Error Classes

```typescript
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super(401, 'UNAUTHORIZED', 'Authentication required');
  }
}
```

### Error Handler

```typescript
// Fastify error handler
export function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
    return;
  }

  // Unexpected error
  request.log.error(error);
  captureException(error);

  reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
}
```

---

## Pattern Selection Guide

| Situation | Pattern to Use |
|-----------|----------------|
| External API call | Circuit Breaker + Retry |
| Database operation | Repository |
| Cross-cutting concern | Middleware |
| Dependency management | Dependency Injection |
| Service shutdown | Graceful Shutdown |
| Error management | Error Handler |
