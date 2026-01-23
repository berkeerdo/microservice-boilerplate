# Database Features

This boilerplate uses **db-bridge** with full feature integration including caching, health monitoring, and performance tracking. Redis is shared across the application for both database caching and general-purpose use.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application                               │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ Repositories │───▶│  database.ts │───▶│   MySQLAdapter   │  │
│  │              │    │              │    │                  │  │
│  │ BaseRepository   │    query()      │    │  @db-bridge/mysql │  │
│  │ UserRepository   │    execute()    │    │                  │  │
│  │ ...             │    table()       │    │                  │  │
│  └──────────────┘    └──────────────┘    └────────┬─────────┘  │
│                              │                     │            │
│                              ▼                     │            │
│                      ┌──────────────┐             │            │
│                      │   redis.ts   │             │            │
│                      │ RedisAdapter │◀────────────┘            │
│                      │  (SHARED)    │                          │
│                      └──────────────┘                          │
│                              │                                  │
│  ┌──────────────┐    ┌──────────────┐                          │
│  │HealthService │───▶│HealthChecker │◀────────────┬            │
│  └──────────────┘    └──────────────┘             │            │
│                                                    │            │
│  ┌──────────────┐    ┌────────────────────┐       │            │
│  │ /metrics     │───▶│ PerformanceMonitor │◀──────┘            │
│  └──────────────┘    └────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Infrastructure                              │
│  ┌──────────────┐                      ┌──────────────────────┐ │
│  │    MySQL     │◀────── Queries ─────▶│       Redis          │ │
│  │   Database   │                      │   (Single Conn)      │ │
│  └──────────────┘                      └──────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Shared Redis Architecture

Redis is initialized once via `@db-bridge/redis` and shared across:
- **Database query caching** - Automatic cache-aside pattern
- **Rate limiting** - Fastify rate limiter
- **Session management** - JWT token blacklisting
- **Custom application cache** - Any application-specific caching

```typescript
// Single Redis instance shared everywhere
import { getRedisAdapter, cacheGet, cacheSet } from './infra/redis/redis.js';

// For database caching (automatic via query options)
const users = await query('SELECT * FROM users', [], { cache: true });

// For custom caching
await cacheSet('my-key', { data: 'value' }, 300);
const data = await cacheGet('my-key');
```

## Features

### 1. Query Caching ($withCache)

Drizzle ORM-style caching with automatic invalidation.

```typescript
// In repository
async findActiveUsers(): Promise<User[]> {
  const sql = 'SELECT * FROM users WHERE active = ?';

  // Without cache
  return this.query(sql, [true]);

  // With cache (5 min default TTL)
  return this.query(sql, [true], { cache: true });

  // With custom cache options
  return this.query(sql, [true], {
    cache: {
      ttl: 600,              // 10 minutes
      key: 'users:active'    // Custom cache key
    }
  });
}
```

**Auto-Invalidation:**
```typescript
// INSERT/UPDATE/DELETE automatically invalidate related cache
await this.execute('INSERT INTO users (name) VALUES (?)', ['John']);
// → Cache for 'users' table is automatically invalidated
```

### 2. Cache Management

```typescript
import { invalidateCache, clearQueryCache, getCacheStats } from './infra/db/database.js';

// Invalidate by pattern
await invalidateCache('user:*');        // All user-related cache
await invalidateCache('user:123:*');    // Specific user's cache

// Clear all query cache
await clearQueryCache();

// Get cache statistics
const stats = getCacheStats();
// => {
//   hits: 1234,
//   misses: 56,
//   hitRate: 0.95,    // 95% hit rate
//   size: 0
// }
```

### 3. Health Monitoring

db-bridge HealthChecker provides real-time database health status.

```typescript
import { getDatabaseHealth, isDatabaseHealthy } from './infra/db/database.js';

// Quick sync check
if (isDatabaseHealthy()) {
  // Database is healthy
}

// Detailed health check
const health = await getDatabaseHealth();
// => {
//   status: 'healthy' | 'degraded' | 'unhealthy',
//   latency: 45,
//   details: {
//     connectionPool: { total: 20, active: 5, idle: 15 },
//     version: '8.0.23'
//   }
// }
```

**Health Status Definitions:**
- **healthy**: Ping < 100ms, pool < 80% utilized
- **degraded**: Ping > 100ms or pool > 80% utilized
- **unhealthy**: Connection failed or pool exhausted

### 4. Performance Monitoring

Automatic slow query detection and performance analysis.

```typescript
import { getPerformanceReport, getSlowQueries } from './infra/db/database.js';

// Get slow queries list
const slowQueries = getSlowQueries(20);
// => [
//   { query: 'SELECT * FROM orders...', duration: 2345, timestamp: Date },
//   ...
// ]

// Get full performance report
const report = await getPerformanceReport();
// => {
//   slowQueries: [...],
//   bottlenecks: [
//     { operation: 'SELECT', averageDuration: 250, count: 42 }
//   ],
//   recommendations: [
//     'Consider adding indexes. Multiple slow SELECT queries detected.'
//   ]
// }
```

**Slow Query Threshold:** Configurable via `DB_QUERY_TIMEOUT * 0.8` (80% of timeout).

### 5. Query Builder

Fluent API for type-safe queries.

```typescript
// In repository using queryBuilder()
async findActiveByRole(role: string): Promise<User[]> {
  const qb = await this.queryBuilder();

  return qb
    .select('id', 'name', 'email')
    .where('active', '=', true)
    .where('role', '=', role)
    .orderBy('created_at', 'DESC')
    .limit(50)
    .$withCache({ ttl: 300 })
    .get();
}
```

### 6. Transactions

Full transaction support with automatic rollback.

```typescript
import { runInTransaction } from './infra/db/database.js';

const result = await runInTransaction(async (tx) => {
  // All operations in same transaction
  const { insertId } = await tx.execute(
    'INSERT INTO orders (user_id, total) VALUES (?, ?)',
    [userId, total]
  );

  await tx.execute(
    'INSERT INTO order_items (order_id, product_id, qty) VALUES (?, ?, ?)',
    [insertId, productId, quantity]
  );

  await tx.execute(
    'UPDATE products SET stock = stock - ? WHERE id = ?',
    [quantity, productId]
  );

  return { orderId: insertId };
});
// Transaction commits on success, rolls back on error
```

## Configuration

### Environment Variables

```bash
# Database Connection
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=secret
DB_NAME=myapp_dev

# Connection Pool
DB_CONNECTION_LIMIT=100
DB_CONNECT_TIMEOUT=10000
DB_QUERY_TIMEOUT=30000

# Redis (for caching)
REDIS_ENABLED=true
REDIS_SERVER=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### Cache Behavior

| Setting | Value | Description |
|---------|-------|-------------|
| Default TTL | 300s | 5 minutes |
| Global Mode | false | Opt-in caching (use `{ cache: true }`) |
| Auto-Invalidate | true | Mutations invalidate related cache |
| Namespace | SERVICE_NAME | Prevents cache collision |

## Health Endpoint Integration

The `/health` endpoint includes database status:

```json
{
  "status": "healthy",
  "components": {
    "database": {
      "status": "healthy",
      "latencyMs": 12,
      "details": {
        "connectionPool": {
          "total": 100,
          "active": 8,
          "idle": 92
        }
      }
    },
    "cache": {
      "status": "healthy",
      "message": "Cache hit rate: 94.2%",
      "details": {
        "hits": 1847,
        "misses": 112,
        "hitRate": 0.942
      }
    }
  }
}
```

## Best Practices

### DO ✅

- Use `{ cache: true }` for frequently accessed, rarely changing data
- Use tags for related data (`['user:123', 'user:123:posts']`)
- Monitor cache hit rate via `/health` endpoint
- Use transactions for multi-table operations
- Check `isDatabaseHealthy()` before critical operations

### DON'T ❌

- Don't cache user-specific data without proper tags
- Don't cache rapidly changing data (use short TTL or no cache)
- Don't ignore slow query warnings in logs
- Don't bypass transactions for related mutations

## File Locations

| File | Purpose |
|------|---------|
| `src/infra/redis/redis.ts` | Shared RedisAdapter (@db-bridge/redis) |
| `src/infra/db/database.ts` | MySQLAdapter, HealthChecker, PerformanceMonitor, query caching |
| `src/infra/db/repositories/BaseRepository.ts` | Repository base class with caching |
| `src/infra/health/HealthService.ts` | Health endpoint integration |
| `dbbridge.config.ts` | Migration & seed configuration |
