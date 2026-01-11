# Design Patterns Guide

Explanation and usage examples of design patterns used in this boilerplate.

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

### Cursor-Based Pagination

For large datasets, use cursor pagination instead of offset:

```typescript
// Cursor pagination - more efficient for large datasets
const result = await userRepository.findAllCursor(100, lastId);
// Returns: { data: User[], hasMore: boolean, nextCursor?: string }

// Offset pagination - less efficient for large offsets
const users = await userRepository.findAll(100, 5000); // Slow!
```

**When to use cursor pagination:**
- Datasets with 10,000+ rows
- Infinite scroll UI patterns
- Real-time data that changes frequently

### Slow Query Logging

BaseRepository automatically logs queries that take >80% of the timeout threshold:

```typescript
// Automatic warning when query approaches timeout
// Logged: { table, durationMs, thresholdMs, timeoutMs, sql }
logger.warn('Slow query detected in users');
```

This helps identify performance issues before they cause timeouts.

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

**Purpose:** Consistent error responses with i18n support and centralized error handling.

**Files:**
- `src/shared/errors/errorHandler.ts` - HTTP error handler
- `src/shared/errors/grpcErrorHandler.ts` - gRPC error handler + HttpStatus enum
- `src/shared/errors/errorSanitizer.ts` - i18n translation
- `src/shared/errors/AppError.ts` - Custom error classes

### Architecture

```
Error Flow (HTTP)                    Error Flow (gRPC)
      │                                    │
      ▼                                    ▼
┌─────────────┐                    ┌─────────────┐
│ AppError    │                    │ AppError    │
│ ZodError    │                    │ thrown      │
│ JWT Error   │                    └──────┬──────┘
└──────┬──────┘                           │
       │                                  ▼
       ▼                          ┌───────────────────┐
┌───────────────────┐             │createGrpcError    │
│ errorHandler.ts   │             │Response()         │
│ + sanitizeError   │             │+ sanitizeError    │
│ + HttpStatus enum │             └─────────┬─────────┘
│ + t() for i18n    │                       │
└─────────┬─────────┘                       ▼
          │                         Translated message
          ▼                         via RequestContext
   RFC 7807 Response
```

### Custom Error Classes

```typescript
// src/shared/errors/AppError.ts
export class AppError extends Error {
  public readonly isOperational = true; // Safe to show to user

  constructor(
    public statusCode: number,
    public code: string,
    message: string,  // Can be i18n key like 'auth.invalidCredentials'
    public details?: unknown
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, 'NOT_FOUND', message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'auth.unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}
```

### HttpStatus Enum

```typescript
// src/shared/errors/grpcErrorHandler.ts
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;
```

### HTTP Error Handler (with i18n)

```typescript
// src/shared/errors/errorHandler.ts
import { sanitizeErrorMessage } from './errorSanitizer.js';
import { HttpStatus } from './grpcErrorHandler.js';
import { t, type TranslationKey } from '../i18n/index.js';

export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const requestId = request.id;

  // 1. AppError - translate message via sanitizeErrorMessage
  if (error instanceof AppError) {
    const message = sanitizeErrorMessage(error);
    reply.status(error.statusCode).send({
      error: error.code,
      message,  // Translated!
      statusCode: error.statusCode,
      requestId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // 2. ZodError - validation with i18n
  if (error instanceof ZodError) {
    const message = t('validation.failed' as TranslationKey);
    reply.status(HttpStatus.BAD_REQUEST).send({
      error: 'VALIDATION_ERROR',
      message,
      statusCode: HttpStatus.BAD_REQUEST,
      details: formatZodError(error),
    });
    return;
  }

  // 3. JWT errors - i18n messages
  if (error.name === 'TokenExpiredError') {
    reply.status(HttpStatus.UNAUTHORIZED).send({
      error: 'AUTHENTICATION_ERROR',
      message: t('auth.tokenExpired' as TranslationKey),
    });
    return;
  }

  // 4. Unknown errors - Sentry + generic message
  captureException(error);
  const message = isDev ? error.message : sanitizeErrorMessage(error, 'common.internalError');
  reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
    error: 'INTERNAL_ERROR',
    message,
  });
}
```

### gRPC Error Handler

```typescript
// src/shared/errors/grpcErrorHandler.ts
export function createGrpcErrorResponse(error: unknown, fallbackKey: string) {
  const message = sanitizeErrorMessage(error, fallbackKey);
  const statusCode = error instanceof AppError ? error.statusCode : HttpStatus.INTERNAL_SERVER_ERROR;

  return {
    success: false,
    error: message,
    status_code: statusCode,
  };
}

// Usage in gRPC handler
} catch (error) {
  callback(null, createGrpcErrorResponse(error, 'auth.loginFailed'));
}
```

### Error Response Format (RFC 7807 inspired)

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Doğrulama başarısız oldu.",
  "statusCode": 400,
  "details": [
    { "field": "email", "message": "Geçerli bir e-posta adresi giriniz." }
  ],
  "requestId": "abc-123",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### i18n Translation Flow

```
1. AppError thrown with i18n key: throw new UnauthorizedError('auth.invalidCredentials')
2. errorHandler catches it
3. sanitizeErrorMessage() called:
   - Gets locale from RequestContext.getLocale()
   - Looks up translation in locales/{locale}.json
   - Returns translated message
4. Response sent with translated message
```

### Best Practices

| Do | Don't |
|----|-------|
| Use `HttpStatus.BAD_REQUEST` | Use magic numbers `400` |
| Use i18n keys as messages | Hardcode user-facing strings |
| Use `sanitizeErrorMessage()` | Return raw error.message |
| Use `isOperational` flag | Expose internal errors |
| Log to Sentry for non-operational | Swallow errors silently |

---

## Pattern Selection Guide

| Situation | Pattern to Use |
|-----------|----------------|
| Database operation | Repository |
| Cross-cutting concern | Middleware |
| Dependency management | Dependency Injection |
| Service shutdown | Graceful Shutdown |
| Error management | Error Handler |
