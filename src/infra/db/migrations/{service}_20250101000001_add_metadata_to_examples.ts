import type { Migration, SchemaBuilder } from '@db-bridge/core';

const migration: Migration = {
  name: '{service}_20250101000001_add_metadata_to_examples',

  async up(schema: SchemaBuilder): Promise<void> {
    await schema.alterTable('examples', (table) => {
      table.addColumn('metadata', 'json', { nullable: true });
      table.addColumn('created_by', 'integer', { nullable: true, unsigned: true });
      table.addColumn('updated_by', 'integer', { nullable: true, unsigned: true });
      table.addColumn('deleted_at', 'timestamp', { nullable: true });
      table.addIndex(['deleted_at'], 'idx_examples_deleted_at');
    });
  },

  async down(schema: SchemaBuilder): Promise<void> {
    await schema.alterTable('examples', (table) => {
      table.dropIndex('idx_examples_deleted_at');
      table.dropColumn('deleted_at');
      table.dropColumn('updated_by');
      table.dropColumn('created_by');
      table.dropColumn('metadata');
    });
  },
};

export default migration;
