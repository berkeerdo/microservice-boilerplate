# LobsterLead Microservice Boilerplate

## Project Overview
This is the microservice boilerplate for the LobsterLead platform. Use this template when creating new services.

## Tech Stack
- **Runtime**: Node.js 20+
- **Language**: TypeScript (ESM)
- **Framework**: Fastify 5
- **Database**: MySQL (Knex migrations)
- **Cache**: Redis (node-caching-mysql-connector-with-redis)
- **gRPC**: Inter-service communication
- **DI Container**: Awilix

## Project Structure
```
src/
├── domain/           # Domain models, value objects, repository interfaces
├── application/      # Use cases (business logic)
├── infra/           # Infrastructure (DB, Redis, Queue)
│   └── db/
│       ├── migrations/  # Knex migrations
│       └── repositories/# MySQL implementations
├── app/             # HTTP layer (routes, middlewares, plugins)
├── grpc/            # gRPC handlers and server
├── shared/          # Shared utilities and errors
└── config/          # Environment configuration
```

## Key Commands
```bash
npm run dev          # Development server
npm run build        # TypeScript build
npm run migrate      # Run database migrations
npm run migrate:make # Create new migration with prefix
npm run test         # Run tests
```

## Database Migrations

### Migration Naming Convention (IMPORTANT!)
LobsterLead uses a **monolith database** with multiple schemas. Each service MUST prefix migrations with service name to prevent conflicts.

**Format:**
```
{service_prefix}_{timestamp}_{description}.ts
```

**Creating new migrations:**
```bash
npm run migrate:make create_users_table
# Creates: {prefix}_20251208123456_create_users_table.ts
```

The prefix is read from `MIGRATION_PREFIX` in `.env` file.

**Examples:**
```
auth_20250101000000_initial_schema.ts        # Auth Service
settings_20250101000000_create_config.ts     # Settings Service
social_20250101000000_create_posts.ts        # Social Media Service
keywords_20250101000000_create_keywords.ts   # Keywords Service
```

**Full documentation:** See `docs/DATABASE_MIGRATIONS.md`

## Setup Checklist for New Service

When creating a new service from this boilerplate:

1. [ ] Update `package.json` with service name
2. [ ] Copy `.env.example` to `.env` and configure:
   - Set `MIGRATION_PREFIX` to your service name (e.g., `keywords`)
   - Set correct ports and database schema
3. [ ] Rename existing migration files with your prefix
4. [ ] Update `CLAUDE.md` and `GEMINI.md` with service-specific documentation
5. [ ] Update gRPC proto files if needed
6. [ ] Configure Docker/deployment files

## Shared Utilities

### Encryption (`src/shared/utils/encryption.ts`)
AES-256-GCM encryption for sensitive data:
```typescript
import { encrypt, decrypt, generateSecureToken } from './shared/utils/index.js';

const encrypted = encrypt('sensitive-data');
const decrypted = decrypt(encrypted);
const token = generateSecureToken(32);
```

### i18n System (`src/shared/i18n/`)
```typescript
import { t } from './shared/i18n/index.js';

t('common.internalError');
t('validation.minLength', { length: 8 });
```

### Atomic Operations Pattern (Race Condition Prevention)

For limit checks, duplicate prevention, or multi-table consistency:

**Files:**
- `src/infra/db/TransactionQueries.ts` - Domain queries with FOR UPDATE locks (CUSTOMIZE)
- `src/application/services/AtomicOperationService.ts` - High-level atomic ops (CUSTOMIZE)

**Pattern:**
```typescript
// AtomicOperationService
async addMember(teamId: number, userId: number): Promise<Result> {
  return this.transactionManager.runInTransaction(async (tx) => {
    const { canAdd } = await TxQueries.checkMemberLimit(tx, teamId); // FOR UPDATE lock
    if (!canAdd) throw new ForbiddenError('team.limitReached');
    return TxQueries.insertMember(tx, teamId, userId);
  }, { invalidateCachePatterns: ['team*'] });
}
```

**Full documentation:** See `docs/ATOMIC_OPERATIONS_PATTERN.md`

## gRPC Error Handling (Gateway-Compatible)

### Error Response Format
All gRPC responses include error fields for gateway HTTP status mapping:

```protobuf
message ExampleResponse {
  bool success = 1;
  ExampleData data = 2;
  string error = 3;           // i18n translated error message
  int32 status_code = 4;      // HTTP-equivalent status code (400, 401, 404, 409, etc.)
}
```

### Using createGrpcErrorResponse
```typescript
import { createGrpcErrorResponse } from '../../shared/errors/grpcErrorHandler.js';

async function createExample(call, callback) {
  try {
    const result = await useCase.execute({ name: call.request.name });
    callback(null, { success: true, data: result });
  } catch (error) {
    logger.error({ err: error }, 'CreateExample failed');
    // Automatically extracts status_code from AppError:
    // - ConflictError → 409
    // - NotFoundError → 404
    // - ValidationError → 400
    callback(null, createGrpcErrorResponse(error, 'example.createFailed'));
  }
}
```

### Error to Status Code Mapping
| AppError Type | HTTP Status | When to Use |
|--------------|-------------|-------------|
| `ValidationError` | 400 | User input is invalid |
| `UnauthorizedError` | 401 | Not authenticated |
| `ForbiddenError` | 403 | Lacks permission |
| `NotFoundError` | 404 | Resource doesn't exist |
| `ConflictError` | 409 | Uniqueness constraint violated |
| `BusinessRuleError` | 422 | Domain rule violated |
| `RateLimitError` | 429 | Too many requests |
| `ServiceUnavailableError` | 503 | External service down |
| `TimeoutError` | 504 | Operation timed out |

### HttpStatus Constants
```typescript
import { HttpStatus } from './shared/errors/index.js';

// Available: OK, CREATED, BAD_REQUEST, UNAUTHORIZED, FORBIDDEN,
// NOT_FOUND, CONFLICT, UNPROCESSABLE_ENTITY, TOO_MANY_REQUESTS,
// INTERNAL_SERVER_ERROR, BAD_GATEWAY, SERVICE_UNAVAILABLE, GATEWAY_TIMEOUT
```

### Gateway Integration
Gateway's `handleProxyResult()` automatically:
1. Detects `success: false` in response
2. Extracts `status_code` and `message`
3. Throws appropriate HTTP error
4. Returns correct HTTP status to client

## Environment Behavior

### NODE_ENV Environments
| Environment | Logger | Sentry | Description |
|-------------|--------|--------|-------------|
| `development` | Pretty logs (pino-pretty, colorized) | Disabled | Local development |
| `test` | Standard JSON logs | Enabled (10% sampling) | Test server (next.lobsterlead.com) |
| `staging` | Standard JSON logs | Enabled (20% sampling) | Pre-production testing |
| `production` | Standard JSON logs | Enabled (5% sampling) | Production environment |

**Important Notes:**
- `test` environment is for the **TEST SERVER**, not unit tests
- Sentry is only disabled in `development` to avoid noise during local dev
- All environments log normally (no silent mode)

## Environment Variables
See `.env.example` for required configuration.

Key variables:
- `MIGRATION_PREFIX` - Prefix for migration files (REQUIRED)
