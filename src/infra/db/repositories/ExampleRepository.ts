import { BaseRepository, IRepository } from './BaseRepository.js';
import { Example } from '../../../domain/models/Example.js';

/**
 * Example Repository Interface
 */
export interface IExampleRepository extends IRepository<Example> {
  findByName(name: string): Promise<Example | null>;
}

/**
 * Example Repository Implementation
 * Demonstrates how to create a concrete repository
 */
export class ExampleRepository extends BaseRepository<Example> implements IExampleRepository {
  constructor() {
    super('examples', 'example'); // tableName, cachePrefix
  }

  /**
   * Find example by name
   */
  async findByName(name: string): Promise<Example | null> {
    const sql = 'SELECT * FROM examples WHERE name = ? LIMIT 1';
    const results = await this.query<Example>(sql, [name]);
    return results[0] || null;
  }

  /**
   * Create a new example
   */
  async create(entity: Partial<Example>): Promise<number> {
    const sql = 'INSERT INTO examples (name, created_at, updated_at) VALUES (?, NOW(), NOW())';
    const result = await this.execute(sql, [entity.name]);
    return result.insertId;
  }

  /**
   * Update an example
   */
  async update(id: number, entity: Partial<Example>): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (entity.name !== undefined) {
      fields.push('name = ?');
      values.push(entity.name);
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = NOW()');
    values.push(id);

    const sql = `UPDATE examples SET ${fields.join(', ')} WHERE id = ?`;
    const result = await this.execute(sql, values);
    return result.affectedRows > 0;
  }
}

/**
 * In-Memory Example Repository
 * Use this for testing or when database is not available
 */
export class InMemoryExampleRepository implements IExampleRepository {
  private examples: Map<number, Example> = new Map();
  private nextId = 1;

  findById(id: number): Promise<Example | null> {
    const data = this.examples.get(id);
    if (!data) return Promise.resolve(null);
    return Promise.resolve(
      new Example({
        id: data.id,
        name: data.name,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      })
    );
  }

  findAll(limit = 100, offset = 0): Promise<Example[]> {
    const all = Array.from(this.examples.values());
    return Promise.resolve(
      all.slice(offset, offset + limit).map(
        (data) =>
          new Example({
            id: data.id,
            name: data.name,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          })
      )
    );
  }

  findByName(name: string): Promise<Example | null> {
    for (const data of this.examples.values()) {
      if (data.name === name) {
        return Promise.resolve(
          new Example({
            id: data.id,
            name: data.name,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          })
        );
      }
    }
    return Promise.resolve(null);
  }

  create(entity: Partial<Example>): Promise<number> {
    const id = this.nextId++;
    const now = new Date();
    const example = new Example({
      id,
      name: entity.name || '',
      createdAt: now,
      updatedAt: now,
    });
    this.examples.set(id, example);
    return Promise.resolve(id);
  }

  update(id: number, entity: Partial<Example>): Promise<boolean> {
    const existing = this.examples.get(id);
    if (!existing) return Promise.resolve(false);

    const updated = new Example({
      id: existing.id,
      name: entity.name ?? existing.name,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    });
    this.examples.set(id, updated);
    return Promise.resolve(true);
  }

  delete(id: number): Promise<boolean> {
    return Promise.resolve(this.examples.delete(id));
  }

  // Test helper: clear all data
  clear(): void {
    this.examples.clear();
    this.nextId = 1;
  }
}
