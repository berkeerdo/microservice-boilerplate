# Microservice Boilerplate

Production-ready Clean Architecture TypeScript microservice template.

## Tech Stack
- **Runtime**: Node.js 22.11+ / 24 LTS (ESM)
- **Framework**: Fastify 5
- **Database**: MySQL via db-bridge (migrations, query cache, health checks)
- **Cache**: Redis (ioredis under @db-bridge/redis)
- **Queue**: RabbitMQ via amqp-resilient (optional)
- **gRPC**: Inter-service communication (optional)
- **DI**: Awilix
- **Observability**: OpenTelemetry + Sentry, preloaded via `--import ./src/instrumentation.ts`

## Architecture (Clean Architecture)
```
src/
├── domain/           # Models, repository interfaces (ports)
├── application/      # Use cases (business logic)
├── infra/
│   ├── db/           # db-bridge adapter, migrations, repositories
│   ├── redis/        # Redis adapter + cache helpers (SCAN+UNLINK invalidation)
│   ├── queue/        # RabbitMQ (amqp-resilient)
│   └── monitoring/   # Sentry helpers
├── grpc/             # gRPC server, handlers, interceptors
├── app/              # HTTP layer: routes, middlewares, plugins
└── shared/
    ├── errors/       # AppError classes + global error handler
    ├── context/      # RequestContext (AsyncLocalStorage, enterWith)
    ├── utils/        # Encryption
    └── i18n/         # Translations (TR/EN)
```

Use cases import repository interfaces from `domain/repositories`, never from `infra`.

## Setup Checklist
1. Update `package.json` with service name
2. Set `MIGRATION_PREFIX` in `.env` (e.g., `keywords`)
3. Update proto files
4. Update `CLAUDE.md` and `GEMINI.md`

## Key Patterns

### Error Handling
```typescript
// Operational errors - shown to user; global errorHandler maps to HTTP status
throw new ValidationError('Invalid input');
throw new NotFoundError('entity.notFound');
throw new ConflictError('entity.alreadyExists'); // -> 409, never string-match messages

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
HTTP locale comes from `x-locale` / `Accept-Language` via RequestContext (registered in server.ts).

## Key Commands
```bash
npm run dev          # Development (tsx watch, instrumentation preloaded)
npm run build        # Build
npm run migrate      # Run migrations (db-bridge)
npm run migrate:make # Create migration (auto-prefixed)
npm test             # Tests (vitest run)
npm run lint         # ESLint 10 flat config
npm run typecheck    # tsc --noEmit (TypeScript 6)
```

## Migration Naming
```
{prefix}_20250101000000_description.ts
```
Prefix from `MIGRATION_PREFIX` env var. Config lives in `dbbridge.config.js`
(plain ESM so it also loads in the production container, where compiled
migrations under `dist/` are used).

## Environment
See `.env.example` for the full list. Notable:
```bash
PORT=300X
GRPC_PORT=5005X
DB_HOST=localhost
REDIS_SERVER=localhost   # NOT REDIS_HOST
MIGRATION_PREFIX=myservice
JWT_SECRET=<64+ chars>
OTEL_ENABLED=false
SENTRY_DSN=
```

## Health Endpoints
- `/health` — liveness: process only, NEVER checks dependencies
- `/ready` — readiness: DB/Redis/queue checks gate traffic
- `/health/detailed` — full async component report

## Error Types → HTTP Status
| Error | Status |
|-------|--------|
| ValidationError | 400 |
| UnauthorizedError | 401 |
| ForbiddenError | 403 |
| NotFoundError | 404 |
| ConflictError | 409 |
