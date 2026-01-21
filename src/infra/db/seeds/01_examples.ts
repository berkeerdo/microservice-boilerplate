import type { Seeder, DatabaseAdapter } from '@db-bridge/core';

const seeder: Seeder = {
  async run(adapter: DatabaseAdapter): Promise<void> {
    // Clear existing entries
    await adapter.execute('DELETE FROM examples');

    // Insert seed entries
    await adapter.execute(
      `INSERT INTO examples (name, description, is_active, metadata) VALUES
        (?, ?, ?, ?),
        (?, ?, ?, ?),
        (?, ?, ?, ?)`,
      [
        'First Example',
        'This is the first example entry',
        true,
        JSON.stringify({ priority: 'high', tags: ['demo', 'first'] }),
        'Second Example',
        'This is the second example entry',
        true,
        JSON.stringify({ priority: 'medium', tags: ['demo'] }),
        'Inactive Example',
        'This example is inactive',
        false,
        null,
      ]
    );
  },
};

export default seeder;
