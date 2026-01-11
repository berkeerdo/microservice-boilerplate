/**
 * Seed: Example Data
 *
 * Seeds the examples table with sample data.
 * Useful for development and testing.
 *
 * Run: npx knex seed:run
 */
import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Clear existing entries
  await knex('examples').del();

  // Insert seed entries
  await knex('examples').insert([
    {
      name: 'First Example',
      description: 'This is the first example entry',
      is_active: true,
      metadata: JSON.stringify({ priority: 'high', tags: ['demo', 'first'] }),
    },
    {
      name: 'Second Example',
      description: 'This is the second example entry',
      is_active: true,
      metadata: JSON.stringify({ priority: 'medium', tags: ['demo'] }),
    },
    {
      name: 'Inactive Example',
      description: 'This example is inactive',
      is_active: false,
      metadata: null,
    },
  ]);
}
