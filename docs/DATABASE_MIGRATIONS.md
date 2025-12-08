# Database Migrations Guide

## Overview

LobsterLead uses a **monolith database** architecture with multiple schemas. Each microservice has its own schema but shares the same MySQL instance. This requires a consistent migration naming convention to prevent conflicts.

## Database Architecture

```
MySQL Instance (localhost:3306)
├── lobsterlead_auth      # Auth Service schema
├── lobsterlead_core      # Core Service schema (future)
├── lobsterlead_settings  # Settings Service schema (future)
└── lobsterlead_...       # Other service schemas
```

## Migration Naming Convention

### Format
```
{service_prefix}_{timestamp}_{description}.ts
```

### Components
| Component | Description | Example |
|-----------|-------------|---------|
| `service_prefix` | Short service identifier | `auth`, `core`, `settings`, `blog` |
| `timestamp` | YYYYMMDDHHMMSS format | `20250101000000` |
| `description` | Snake_case description | `initial_schema`, `add_users_table` |

### Examples

```
# Auth Service
auth_20250101000000_initial_schema.ts
auth_20250101000001_seed_data.ts
auth_20250115120000_add_2fa_columns.ts

# Core Service
core_20250101000000_initial_schema.ts
core_20250101000001_seed_data.ts

# Settings Service
settings_20250101000000_initial_schema.ts
settings_20250201140000_add_user_preferences.ts
```

## Why Service Prefix?

### Problem: Without Prefix
```
# Auth Service
20250101000000_initial_schema.ts

# Core Service (CONFLICT!)
20250101000000_initial_schema.ts  ← Same name, different service
```

When Knex runs migrations, it tracks them by filename in `knex_migrations` table. Without prefixes:
- Migration names can conflict between services
- Hard to identify which service a migration belongs to
- Rollback operations become confusing

### Solution: With Prefix
```
# Auth Service
auth_20250101000000_initial_schema.ts

# Core Service (No conflict)
core_20250101000000_initial_schema.ts
```

Benefits:
- ✅ Unique migration names across all services
- ✅ Easy to identify service ownership
- ✅ Alphabetically grouped by service
- ✅ Safe rollback operations

## Service Prefix Convention

**Prefix Format:** Use service name (short form) as prefix.

**Pattern:** `{service-name}_` → Schema: `lobsterlead_{service-name}`

**Examples:**
| Service Name | Prefix | Schema | Migration Example |
|--------------|--------|--------|-------------------|
| auth | `auth_` | `lobsterlead_auth` | `auth_20250101000000_initial_schema.ts` |
| settings | `settings_` | `lobsterlead_settings` | `settings_20250101000000_create_config.ts` |
| social | `social_` | `lobsterlead_social` | `social_20250101000000_create_posts.ts` |
| integrations | `integrations_` | `lobsterlead_integrations` | `integrations_20250101000000_create_platforms.ts` |
| keywords | `keywords_` | `lobsterlead_keywords` | `keywords_20250101000000_create_keywords.ts` |

> **Note:** Gateway service doesn't have a database, so no migrations are needed.

## Creating a New Migration

### 1. Generate timestamp
```bash
# Current timestamp in YYYYMMDDHHMMSS format
date +"%Y%m%d%H%M%S"
# Output: 20250108143022
```

### 2. Create migration file
```bash
# Format: {prefix}_{timestamp}_{description}.ts
touch src/infra/db/migrations/auth_20250108143022_add_user_avatar.ts
```

### 3. Write migration
```typescript
import type { Knex } from 'knex';

/**
 * Migration: Add avatar column to users table
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.string('avatarUrl', 500).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('avatarUrl');
  });
}
```

### 4. Run migration
```bash
npm run migrate
```

## Migration Commands

```bash
# Run all pending migrations
npm run migrate

# Rollback last batch
npm run migrate:rollback

# Check migration status
npm run migrate:status

# Create fresh database (drops all tables)
npm run migrate:fresh
```

## Knex Migration Table

Each schema has its own `knex_migrations` table:

```sql
SELECT * FROM lobsterlead_auth.knex_migrations;

-- Output:
-- id | name                                    | batch | migration_time
-- 1  | auth_20250101000000_initial_schema.ts   | 1     | 2025-01-08 14:03:51
-- 2  | auth_20250101000001_seed_data.ts        | 1     | 2025-01-08 14:03:51
```

## Best Practices

### DO ✅
- Always use service prefix
- Use descriptive names: `auth_20250108_add_password_reset_tokens.ts`
- Keep migrations idempotent when possible (use `hasTable`, `hasColumn`)
- Include both `up` and `down` functions
- Test rollback before deploying

### DON'T ❌
- Don't modify existing migrations that are already deployed
- Don't use same timestamp for multiple migrations
- Don't put business logic in migrations
- Don't skip the service prefix

## Troubleshooting

### Migration already exists error
```bash
# Check if migration was already run
npm run migrate:status

# If needed, manually remove from knex_migrations table
mysql -u root -e "DELETE FROM lobsterlead_auth.knex_migrations WHERE name='migration_name.ts';"
```

### Reset database completely
```bash
# Drop and recreate schema
mysql -u root -e "DROP DATABASE IF EXISTS lobsterlead_auth; CREATE DATABASE lobsterlead_auth CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Run fresh migrations
npm run migrate
```
