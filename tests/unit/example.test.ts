import { describe, it, expect } from 'vitest';
import { Example } from '../../src/domain/models/Example.js';

describe('Example Domain Model', () => {
  describe('create', () => {
    it('should create a new example with name', () => {
      const example = Example.create({ name: 'Test Example' });

      expect(example.name).toBe('Test Example');
      expect(example.id).toBe(0);
      expect(example.createdAt).toBeInstanceOf(Date);
      expect(example.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('updateName', () => {
    it('should update the name and updatedAt', () => {
      const example = Example.create({ name: 'Original' });
      const originalUpdatedAt = example.updatedAt;

      // Small delay to ensure time difference
      example.updateName('Updated');

      expect(example.name).toBe('Updated');
      expect(example.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });
  });

  describe('toPersistence', () => {
    it('should return persistence object', () => {
      const example = new Example({
        id: 1,
        name: 'Test',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-02'),
      });

      const persistence = example.toPersistence();

      expect(persistence).toEqual({
        id: 1,
        name: 'Test',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-02'),
      });
    });
  });
});
