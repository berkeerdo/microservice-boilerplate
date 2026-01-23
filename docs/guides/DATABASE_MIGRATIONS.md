# Database Migrations Guide

## Overview

This boilerplate uses **db-bridge** for database operations, migrations, and seeding. db-bridge provides a unified API for MySQL and PostgreSQL with a powerful migration system.

## Database Architecture

```
MySQL Instance (localhost:3306)
├── myservice_dev      # Development database
├── myservice_test     # Test database
└── myservice_prod     # Production database
```

## Configuration

### Config File (`dbbridge.config.ts`)

```typescript
import { defineConfig } from '@db-bridge/core/cli';

const migrationPrefix = process.env.MIGRATION_PREFIX || 'service';

export default defineConfig({
  connection: {
    dialect: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'microservice_dev',
  },
  migrations: {
    directory: './src/infra/db/migrations',
    tableName: `db_bridge_migrations_${migrationPrefix}`,
    prefix: migrationPrefix,
  },
  seeds: {
    directory: './src/infra/db/seeds',
    prefix: migrationPrefix,
  },
  types: {
    output: './src/types/database.ts',
  },
});
```

### Environment Variables

```bash
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=secret
DB_NAME=myservice_dev
MIGRATION_PREFIX=myservice
```

## Migration Commands

```bash
# Create a new migration
npm run migrate:make create_users_table

# Run pending migrations
npm run migrate

# Check migration status
npm run migrate:status

# Rollback last batch
npm run migrate:rollback

# Preview SQL without executing (dry-run)
npx db-bridge migrate:latest --dry-run
```

## Creating Migrations

### 1. Generate Migration

```bash
npm run migrate:make create_users_table
# Creates: src/infra/db/migrations/{prefix}_20260122120000_create_users_table.ts
```

### 2. Write Migration

```typescript
// src/infra/db/migrations/myservice_20260122120000_create_users_table.ts
import type { Migration, SchemaBuilder } from '@db-bridge/core';

const migration: Migration = {
  name: 'myservice_20260122120000_create_users_table',

  async up(schema: SchemaBuilder): Promise<void> {
    await schema.createTable('users', (table) => {
      table.increments('id');
      table.string('name', 100).notNull();
      table.string('email', 255).unique().notNull();
      table.string('password', 255).notNull();
      table.enum('role', ['admin', 'user', 'guest']).default('user');
      table.boolean('is_active').notNull().default(true);
      table.timestamp('email_verified_at').nullable();
      table.timestamps(); // created_at, updated_at

      table.index(['is_active'], 'idx_users_is_active');
      table.index(['created_at'], 'idx_users_created_at');
    });
  },

  async down(schema: SchemaBuilder): Promise<void> {
    await schema.dropTableIfExists('users');
  },
};

export default migration;
```

### 3. Run Migration

```bash
npm run migrate
```

## Schema Builder API

### Column Types

```typescript
await schema.createTable('examples', (table) => {
  // Primary Keys
  table.increments('id');              // INT AUTO_INCREMENT PRIMARY KEY
  table.bigIncrements('id');           // BIGINT AUTO_INCREMENT PRIMARY KEY

  // Strings
  table.string('name', 100);           // VARCHAR(100)
  table.string('email', 255);          // VARCHAR(255)
  table.text('description');           // TEXT
  table.longText('content');           // LONGTEXT

  // Numbers
  table.integer('count');              // INT
  table.bigInteger('views');           // BIGINT
  table.decimal('price', 10, 2);       // DECIMAL(10,2)
  table.float('rating');               // FLOAT

  // Boolean
  table.boolean('is_active');          // TINYINT(1)

  // Dates
  table.date('birth_date');            // DATE
  table.datetime('scheduled_at');      // DATETIME
  table.timestamp('published_at');     // TIMESTAMP
  table.timestamps();                  // created_at + updated_at

  // JSON
  table.json('metadata');              // JSON

  // Enum
  table.enum('status', ['draft', 'published', 'archived']);
});
```

### Column Modifiers

```typescript
table.string('email', 255)
  .notNull()                    // NOT NULL
  .unique()                     // UNIQUE constraint
  .default('test@example.com'); // DEFAULT value

table.integer('views')
  .unsigned()                   // UNSIGNED
  .default(0);

table.timestamp('deleted_at')
  .nullable();                  // Allow NULL
```

### Foreign Keys

```typescript
await schema.createTable('posts', (table) => {
  table.increments('id');
  table.string('title', 255).notNull();

  // Foreign key column
  table.integer('user_id').unsigned().notNull();

  // Foreign key constraint
  table.foreign('user_id')
    .references('id')
    .on('users')
    .onDelete('CASCADE')
    .onUpdate('CASCADE');
});
```

### Indexes

```typescript
await schema.createTable('products', (table) => {
  table.increments('id');
  table.string('sku', 50).notNull();
  table.string('name', 255).notNull();
  table.integer('category_id').unsigned();

  // Single column index
  table.index(['name'], 'idx_products_name');

  // Composite index
  table.index(['category_id', 'name'], 'idx_products_category_name');

  // Unique constraint
  table.unique(['sku'], 'unq_products_sku');
});
```

### Alter Table

```typescript
// Add column
await schema.alterTable('users', (table) => {
  table.string('avatar_url', 500).nullable();
});

// Drop column
await schema.alterTable('users', (table) => {
  table.dropColumn('avatar_url');
});

// Rename column
await schema.renameColumn('users', 'name', 'full_name');

// Drop table
await schema.dropTableIfExists('old_table');
```

## Seeding

### Create Seeder

```bash
npm run seed:make users
# Creates: src/infra/db/seeds/01_users.ts
```

### Seeder with Priority & Dependencies (v1.2.0)

```typescript
// src/infra/db/seeds/01_users.ts
import type { Seeder, DatabaseAdapter } from '@db-bridge/core';

const seeder: Seeder = {
  name: 'users',
  priority: 10,        // Lower runs first (default: 100)
  depends: [],         // Run after these seeders

  async run(adapter: DatabaseAdapter): Promise<void> {
    await adapter.table('users').insert([
      { name: 'Admin', email: 'admin@example.com', role: 'admin' },
      { name: 'User', email: 'user@example.com', role: 'user' },
    ]);
  },
};

export default seeder;
```

```typescript
// src/infra/db/seeds/02_posts.ts
import type { Seeder, DatabaseAdapter } from '@db-bridge/core';

const seeder: Seeder = {
  name: 'posts',
  priority: 20,
  depends: ['users'],  // Requires users seeder first

  async run(adapter: DatabaseAdapter): Promise<void> {
    const users = await adapter.table('users').select('id').get();

    await adapter.table('posts').insert([
      { title: 'First Post', user_id: users[0].id },
      { title: 'Second Post', user_id: users[1].id },
    ]);
  },
};

export default seeder;
```

### Run Seeders

```bash
npm run seed
```

## Type Generation (v1.2.0)

Auto-generate TypeScript interfaces from your database schema:

```bash
npm run db:types
# Generates: src/types/database.ts
```

**Output:**

```typescript
// src/types/database.ts (auto-generated)
export interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'user' | 'guest';
  is_active: boolean;
  email_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Post {
  id: number;
  title: string;
  user_id: number;
  created_at: Date;
  updated_at: Date;
}
```

## Migration Naming Convention

### Format

```
{prefix}_{timestamp}_{description}.ts
```

### Examples

```
myservice_20260122120000_create_users_table.ts
myservice_20260122120001_create_posts_table.ts
myservice_20260123090000_add_avatar_to_users.ts
```

### Why Prefix?

When multiple services share a database, prefixes prevent migration name conflicts:

```
# Without prefix (CONFLICT!)
20260122120000_create_users_table.ts  ← auth-service
20260122120000_create_users_table.ts  ← user-service

# With prefix (OK)
auth_20260122120000_create_users_table.ts
user_20260122120000_create_settings_table.ts
```

## Best Practices

### DO ✅

- Always use service prefix via `MIGRATION_PREFIX`
- Use descriptive names: `create_users_table`, `add_avatar_to_users`
- Include both `up()` and `down()` functions
- Use `--dry-run` to preview SQL before production deployments
- Test rollback locally before deploying
- Use `timestamps()` for audit trails

### DON'T ❌

- Don't modify migrations that are already deployed
- Don't use same timestamp for multiple migrations
- Don't put business logic in migrations
- Don't skip the service prefix
- Don't manually edit migration table

## Troubleshooting

### Check Migration Status

```bash
npm run migrate:status
```

### Reset Database (Development Only)

```bash
# Drop all tables and re-run migrations
npx db-bridge migrate:fresh

# Then seed
npm run seed
```

### Preview SQL (Dry Run)

```bash
npx db-bridge migrate:latest --dry-run
```

This shows the SQL that would be executed without actually running it.

## Migration Table

db-bridge tracks migrations in `db_bridge_migrations_{prefix}` table:

```sql
SELECT * FROM db_bridge_migrations_myservice;

-- id | name                                        | batch | checksum     | executed_at
-- 1  | myservice_20260122120000_create_users_table | 1     | abc123...    | 2026-01-22 12:00:00
-- 2  | myservice_20260122120001_create_posts_table | 1     | def456...    | 2026-01-22 12:00:01
```
