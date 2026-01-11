/**
 * Migration: Create Examples Table
 *
 * This is an example migration demonstrating:
 * - Table creation with proper column types—Indexes for query optimization—Timestamps with automatic updates.
 *
 * Run: npm run migrate
 * Rollback: npm run migrate:rollback
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('examples', (table) => {
    // Primary key
    table.increments('id').primary();

    // Fields
    table.string('name', 100).notNullable().unique();
    table.text('description').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table
      .timestamp('updated_at')
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));

    // Indexes
    table.index(['is_active'], 'idx_examples_is_active');
    table.index(['created_at'], 'idx_examples_created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('examples');
}
