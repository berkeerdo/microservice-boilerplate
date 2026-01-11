#!/usr/bin/env tsx
/**
 * Custom Migration Generator
 *
 * Creates migration files with service prefix automatically.
 * Usage: npm run migrate:make <migration_name>
 *
 * Example:
 *   npm run migrate:make add_user_avatar
 *   Creates: auth_20251208123456_add_user_avatar.ts
 *
 * Requires MIGRATION_PREFIX in .env file
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SERVICE_PREFIX = process.env.MIGRATION_PREFIX;

if (!SERVICE_PREFIX) {
  console.error('Error: MIGRATION_PREFIX is not set in .env file');
  console.error('Add MIGRATION_PREFIX=auth (or your service prefix) to .env');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(process.cwd(), 'src/infra/db/migrations');

const MIGRATION_TEMPLATE = `import type { Knex } from 'knex';

/**
 * Migration: {{DESCRIPTION}}
 */
export async function up(knex: Knex): Promise<void> {
  // TODO: Implement migration
}

export async function down(knex: Knex): Promise<void> {
  // TODO: Implement rollback
}
`;

function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Error: Migration name is required');
    console.error('Usage: npm run migrate:make <migration_name>');
    console.error('Example: npm run migrate:make add_user_avatar');
    process.exit(1);
  }

  const migrationName = toSnakeCase(args.join('_'));
  const timestamp = generateTimestamp();
  const fileName = `${SERVICE_PREFIX}_${timestamp}_${migrationName}.ts`;
  const filePath = path.join(MIGRATIONS_DIR, fileName);

  // Ensure migrations directory exists
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }

  // Create migration file
  const content = MIGRATION_TEMPLATE.replace('{{DESCRIPTION}}', migrationName.replace(/_/g, ' '));
  fs.writeFileSync(filePath, content);

  console.log(`✅ Created migration: ${fileName}`);
  console.log(`   Path: ${filePath}`);
}

main();
