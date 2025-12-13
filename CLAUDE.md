# LobsterLead Microservice Boilerplate

## Project Overview
Bu proje LobsterLead platformunun microservice boilerplate'idir. Yeni servis oluştururken bu template kullanılır.

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
