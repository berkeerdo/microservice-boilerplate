/**
 * Migration: Add Metadata to Examples
 *
 * Demonstrates:
 * - ALTER TABLE operations—Adding JSON columns for flexible data—Adding foreign key ready columns.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('examples', (table) => {
    // Add metadata JSON column
    table.json('metadata').nullable().after('description');

    // Add user tracking (for a future foreign key)
    table.integer('created_by').unsigned().nullable().after('metadata');
    table.integer('updated_by').unsigned().nullable().after('created_by');

    // Add soft delete
    table.timestamp('deleted_at').nullable().after('updated_at');

    // Index for soft delete queries
    table.index(['deleted_at'], 'idx_examples_deleted_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('examples', (table) => {
    table.dropIndex(['deleted_at'], 'idx_examples_deleted_at');
    table.dropColumn('deleted_at');
    table.dropColumn('updated_by');
    table.dropColumn('created_by');
    table.dropColumn('metadata');
  });
}
