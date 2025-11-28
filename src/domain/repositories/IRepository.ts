/**
 * Base Repository Interface
 * Defines the contract for all repositories
 *
 * This interface lives in the domain layer because:
 * - Domain layer defines WHAT operations are needed
 * - Infrastructure layer defines HOW they are implemented
 * - This follows Dependency Inversion Principle (DIP)
 */
export interface IRepository<T> {
  /**
   * Find entity by ID
   */
  findById(id: number): Promise<T | null>;

  /**
   * Find all entities with pagination
   */
  findAll(limit?: number, offset?: number): Promise<T[]>;

  /**
   * Create a new entity
   * @returns The ID of the created entity
   */
  create(entity: Partial<T>): Promise<number>;

  /**
   * Update an existing entity
   * @returns true if entity was updated
   */
  update(id: number, entity: Partial<T>): Promise<boolean>;

  /**
   * Delete an entity by ID
   * @returns true if entity was deleted
   */
  delete(id: number): Promise<boolean>;

  /**
   * Count total entities (optional)
   */
  count?(): Promise<number>;
}
