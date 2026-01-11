# Microservice Boilerplate

Production-ready Clean Architecture TypeScript microservice template.

## Tech Stack
- **Runtime**: Node.js 20+ (ESM)
- **Framework**: Fastify 5
- **Database**: MySQL (Knex)
- **Cache**: Redis
- **gRPC**: Inter-service communication
- **DI**: Awilix

## Architecture (Clean Architecture)
```
src/
├── domain/           # Models, repository interfaces
├── application/      # Use cases (business logic)
├── infra/
│   └── db/
│       ├── migrations/
│       └── repositories/
├── grpc/             # gRPC handlers
└── shared/
    ├── errors/       # AppError classes
    ├── utils/        # Encryption, i18n
    └── i18n/         # Translations
```

## Setup Checklist
1. Update `package.json` with service name
2. Set `MIGRATION_PREFIX` in `.env` (e.g., `keywords`)
3. Update proto files
4. Update `CLAUDE.md` and `GEMINI.md`

## Key Patterns

### Error Handling
```typescript
// Operational errors - shown to user
throw new ValidationError('Invalid input');
throw new NotFoundError('entity.notFound');

// gRPC response
callback(null, createGrpcErrorResponse(error, 'domain.actionFailed'));
```

### Atomic Operations (Race Condition Prevention)
```typescript
// Use FOR UPDATE locks for limit checks
const result = await transactionManager.runInTransaction(async (tx) => {
  const { canAdd } = await TxQueries.checkLimit(tx, teamId);
  if (!canAdd) throw new ForbiddenError('limit.reached');
  return await TxQueries.insert(tx, data);
}, { invalidateCachePatterns: ['entity*'] });
```

### i18n
```typescript
import { t } from './shared/i18n/index.js';
t('common.internalError');
t('validation.minLength', { length: 8 });
```

## Key Commands
```bash
npm run dev          # Development
npm run build        # Build
npm run migrate      # Run migrations
npm run migrate:make # Create migration (auto-prefixed)
npm run test         # Tests
```

## Migration Naming
```
{prefix}_20250101000000_description.ts
```
Prefix from `MIGRATION_PREFIX` env var.

## Environment
```bash
PORT=300X
GRPC_PORT=5005X
DB_HOST=localhost
REDIS_HOST=localhost
MIGRATION_PREFIX=myservice
```

## Error Types → HTTP Status
| Error | Status |
|-------|--------|
| ValidationError | 400 |
| UnauthorizedError | 401 |
| ForbiddenError | 403 |
| NotFoundError | 404 |
| ConflictError | 409 |
