import type { Migration, SchemaBuilder } from '@db-bridge/core';

const migration: Migration = {
  name: '{service}_20250101000000_create_examples_table',

  async up(schema: SchemaBuilder): Promise<void> {
    await schema.createTable('examples', (table) => {
      table.increments('id');
      table.string('name', 100).notNull().unique();
      table.text('description').nullable();
      table.boolean('is_active').notNull().default(true);
      table.timestamp('created_at').notNull().default('CURRENT_TIMESTAMP');
      table.timestamp('updated_at').notNull().default('CURRENT_TIMESTAMP');
      table.index(['is_active'], 'idx_examples_is_active');
      table.index(['created_at'], 'idx_examples_created_at');
    });
  },

  async down(schema: SchemaBuilder): Promise<void> {
    await schema.dropTableIfExists('examples');
  },
};

export default migration;
