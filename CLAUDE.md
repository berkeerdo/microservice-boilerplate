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
import { encrypt, decrypt, generateSecureToken, generateCodeVerifier, generateCodeChallenge } from './shared/utils/index.js';

// Encrypt/decrypt sensitive data
const encrypted = encrypt('sensitive-data');
const decrypted = decrypt(encrypted);

// Generate secure tokens (OAuth state, CSRF, etc.)
const token = generateSecureToken(32); // 64 hex chars

// PKCE support
const verifier = generateCodeVerifier();
const challenge = generateCodeChallenge(verifier);
```

### TransactionManager (`src/infra/db/TransactionManager.ts`)
Database transactions with automatic cache invalidation:
```typescript
import { transactionManager } from './infra/db/TransactionManager.js';

const result = await transactionManager.runInTransaction(
  async (tx) => {
    const { insertId } = await tx.execute('INSERT INTO items...', [...]);
    await tx.execute('INSERT INTO item_details...', [...]);
    return { itemId: insertId };
  },
  { invalidateCachePatterns: ['item*', 'inventory*'] }
);
```

### Atomic Operations Pattern (IMPORTANT for Race Conditions)

For operations requiring limit checks, duplicate prevention, or multi-table consistency, use the Atomic Operations pattern:

**Files:**
| File | Purpose |
|------|---------|
| `src/infra/db/TransactionQueries.ts` | Domain-specific queries with FOR UPDATE locks (CUSTOMIZE) |
| `src/application/services/AtomicOperationService.ts` | High-level atomic operations (CUSTOMIZE) |

**Architecture:**
```
Use Case (validation)
    ↓
AtomicOperationService (atomic ops)
    ↓
TransactionManager (TX wrapper)
    ↓
TxQueries (low-level queries with locks)
```

**Example - Prevent Limit Bypass:**
```typescript
// TxQueries - check limit with FOR UPDATE lock
async checkMemberLimit(tx: TransactionContext, teamId: number): Promise<LimitCheckResult> {
  const [team] = await tx.query<{ maxMembers: number }>(
    `SELECT maxMembers FROM teams WHERE id = ? FOR UPDATE`, // Lock row
    [teamId]
  );
  const count = await this.countMembers(tx, teamId);
  return { currentCount: count, maxAllowed: team.maxMembers, canAdd: count < team.maxMembers };
}

// AtomicOperationService - atomic add member
async addMember(teamId: number, userId: number): Promise<AddMemberResult> {
  return this.transactionManager.runInTransaction(async (tx) => {
    const { canAdd } = await TxQueries.checkMemberLimit(tx, teamId);
    if (!canAdd) throw new ForbiddenError('team.memberLimitReached');

    const memberId = await TxQueries.insertMember(tx, teamId, userId);
    return { memberId, teamId, userId };
  }, { invalidateCachePatterns: ['team*'] });
}
```

**Full documentation:** See `docs/ATOMIC_OPERATIONS_PATTERN.md`

### i18n System (`src/shared/i18n/`)
Internationalization with interpolation support:
```typescript
import { t } from './shared/i18n/index.js';

// Basic translation
t('common.internalError'); // Uses RequestContext locale

// With parameters (interpolation)
t('validation.minLength', { length: 8 });
// → "Password must be at least 8 characters"

// Force specific locale
t('common.internalError', 'en');
```

### Error Handling with i18n
```typescript
import { createGrpcErrorResponse, sanitizeErrorMessage } from './shared/errors/index.js';

// gRPC handlers - auto i18n based on RequestContext
callback(null, createGrpcErrorResponse(error, 'common.internalError'));

// HTTP handlers
const message = sanitizeErrorMessage(error, 'common.validationError');
```

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
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';

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
Developer-friendly HTTP status code constants:
```typescript
import { HttpStatus, HttpStatusName } from './shared/errors/index.js';

// Use in comparisons or manual responses
if (response.status_code === HttpStatus.CONFLICT) {
  // Handle conflict...
}

// Available constants:
HttpStatus.OK                    // 200
HttpStatus.CREATED               // 201
HttpStatus.BAD_REQUEST           // 400
HttpStatus.UNAUTHORIZED          // 401
HttpStatus.FORBIDDEN             // 403
HttpStatus.NOT_FOUND             // 404
HttpStatus.CONFLICT              // 409
HttpStatus.UNPROCESSABLE_ENTITY  // 422
HttpStatus.TOO_MANY_REQUESTS     // 429
HttpStatus.INTERNAL_SERVER_ERROR // 500
HttpStatus.BAD_GATEWAY           // 502
HttpStatus.SERVICE_UNAVAILABLE   // 503
HttpStatus.GATEWAY_TIMEOUT       // 504

// Reverse lookup (status code → name)
HttpStatusName[409] // 'CONFLICT'
HttpStatusName[404] // 'NOT_FOUND'
```

### i18n Error Keys Convention
Use dot-notation keys for consistent i18n:
```typescript
// Domain pattern: {domain}.{action}Failed
createGrpcErrorResponse(error, 'team.createFailed');
createGrpcErrorResponse(error, 'user.notFound');
createGrpcErrorResponse(error, 'workspace.alreadyExists');
```

### Handler with Required Fields
When response has required fields, use spread pattern:
```typescript
callback(null, {
  requiredField: defaultValue,
  ...createGrpcErrorResponse(error, 'domain.actionFailed'),
});
```

### Gateway Integration
Gateway's `handleProxyResult()` automatically:
1. Detects `success: false` in response
2. Extracts `status_code` and `message`
3. Throws appropriate HTTP error (ConflictError, NotFoundError, etc.)
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
- `ENCRYPTION_KEY` - Key for AES-256-GCM encryption (optional, falls back to JWT_SECRET)
