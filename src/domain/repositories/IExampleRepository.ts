/**
 * Example Repository Interface
 * Extends base repository with example-specific operations
 */
import type { IRepository } from './IRepository.js';
import type { Example } from '../models/Example.js';

export interface IExampleRepository extends IRepository<Example> {
  /**
   * Find example by name
   */
  findByName(name: string): Promise<Example | null>;
}
