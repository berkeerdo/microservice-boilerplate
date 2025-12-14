/**
 * Atomic Operation Service Template
 * Provides high-level atomic operations for domain entities
 *
 * IMPORTANT: This is a TEMPLATE file. Copy and customize for your domain.
 *
 * This service ensures data integrity by wrapping multi-step operations
 * in database transactions with proper locking.
 *
 * Pattern:
 * - Use Case calls AtomicOperationService for complex operations
 * - AtomicOperationService uses TransactionManager + TxQueries
 * - All operations are atomic (all-or-nothing)
 *
 * Benefits:
 * - DRY: Common patterns extracted here, used by multiple use cases
 * - SRP: Each method handles one atomic operation
 * - Race condition prevention via FOR UPDATE locks
 *
 * Example Usage in Use Case:
 * ```typescript
 * class CreateOrderUseCase {
 *   constructor(private readonly atomicOps: AtomicOperationService) {}
 *
 *   async execute(input: CreateOrderInput) {
 *     // Validation (read-only, before transaction)
 *     const product = await this.productRepo.findById(input.productId);
 *     if (!product) throw new NotFoundError('Product not found');
 *
 *     // Atomic operation (limit check + insert)
 *     return this.atomicOps.createOrderWithInventoryCheck({
 *       productId: input.productId,
 *       quantity: input.quantity,
 *       userId: input.userId,
 *     });
 *   }
 * }
 * ```
 */
import type { TransactionManager } from '../../infra/db/TransactionManager.js';
import { TxQueries, type LimitCheckResult } from '../../infra/db/TransactionQueries.js';
import { ForbiddenError, ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import logger from '../../infra/logger/logger.js';

// ============================================
// RESULT TYPES
// Define result types for your atomic operations
// ============================================

/**
 * Example: Item addition result
 */
export interface AddItemResult {
  itemId: number;
  parentId: number;
  wasReactivated: boolean;
}

/**
 * Example: Batch operation result
 */
export interface BatchOperationResult {
  successCount: number;
  failedIds: number[];
  results: { id: number; success: boolean; error?: string }[];
}

// ============================================
// SERVICE CLASS
// ============================================

/**
 * Atomic Operation Service
 *
 * CUSTOMIZE FOR YOUR DOMAIN:
 * - Replace example methods with your domain operations
 * - Add new atomic operations as needed
 * - Keep each method focused on one atomic operation (SRP)
 */
export class AtomicOperationService {
  constructor(private readonly transactionManager: TransactionManager) {}

  // ============================================
  // EXAMPLE: ADD ITEM WITH LIMIT CHECK
  // Pattern: Check limit → Insert → Return result
  // ============================================

  /**
   * Add item atomically with limit checking
   *
   * Flow:
   * 1. Lock parent row (FOR UPDATE)
   * 2. Check item limit
   * 3. Check if already exists (for reactivation)
   * 4. Insert or reactivate
   *
   * @throws ForbiddenError if limit reached
   * @throws ConflictError if already active
   * @throws NotFoundError if parent doesn't exist
   */
  async addItem(
    parentId: number,
    name: string,
    createdBy: number,
    options?: {
      skipLimitCheck?: boolean;
    }
  ): Promise<AddItemResult> {
    return this.transactionManager.runInTransaction(
      async (tx) => {
        // Get parent info with lock
        const parent = await TxQueries.getEntityForUpdate(tx, parentId);
        if (!parent) {
          throw new NotFoundError('parent.notFound');
        }

        // Check limit (unless skipped)
        if (!options?.skipLimitCheck) {
          const limitCheck = await TxQueries.checkItemLimit(tx, parentId);
          if (!limitCheck.canAdd) {
            throw new ForbiddenError(`item.limitReached:${limitCheck.maxAllowed}`);
          }
        }

        // Check for duplicate
        const hasDuplicate = await TxQueries.hasDuplicate(tx, parentId, name);
        if (hasDuplicate) {
          throw new ConflictError('item.alreadyExists');
        }

        // Insert new item
        const itemId = await TxQueries.insertItem(tx, parentId, name, createdBy);

        logger.debug({ parentId, itemId, name }, 'Item added atomically');

        return { itemId, parentId, wasReactivated: false };
      },
      { invalidateCachePatterns: ['item*', 'parent*'] }
    );
  }

  // ============================================
  // EXAMPLE: BATCH OPERATION
  // Pattern: All-or-nothing for multiple items
  // ============================================

  /**
   * Add multiple items atomically
   * All-or-nothing: if any add fails, all are rolled back
   */
  async addMultipleItems(
    parentId: number,
    items: { name: string }[],
    createdBy: number
  ): Promise<AddItemResult[]> {
    if (items.length === 0) {
      return [];
    }

    return this.transactionManager.runInTransaction(
      async (tx) => {
        // Check limit once for all items
        const limitCheck = await TxQueries.checkItemLimit(tx, parentId);
        const availableSlots = limitCheck.maxAllowed - limitCheck.currentCount;

        if (items.length > availableSlots) {
          throw new ForbiddenError(
            `item.limitReached:${limitCheck.maxAllowed}:need:${items.length}:available:${availableSlots}`
          );
        }

        // Add all items
        const results: AddItemResult[] = [];

        for (const item of items) {
          const itemId = await TxQueries.insertItem(tx, parentId, item.name, createdBy);
          results.push({ itemId, parentId, wasReactivated: false });
        }

        logger.debug({ parentId, count: items.length }, 'Multiple items added atomically');

        return results;
      },
      { invalidateCachePatterns: ['item*', 'parent*'] }
    );
  }

  // ============================================
  // EXAMPLE: STATUS TRANSITION
  // Pattern: Check current state → Update
  // ============================================

  /**
   * Update entity status atomically
   * Ensures no concurrent modifications
   */
  async updateEntityStatus(
    entityId: number,
    newStatus: string,
    allowedFromStatuses: string[]
  ): Promise<{ previousStatus: string; newStatus: string }> {
    return this.transactionManager.runInTransaction(
      async (tx) => {
        // Get current status with lock
        const entity = await TxQueries.getEntityForUpdate(tx, entityId);
        if (!entity) {
          throw new NotFoundError('entity.notFound');
        }

        // Validate transition
        if (!allowedFromStatuses.includes(entity.status)) {
          throw new ForbiddenError(`entity.invalidStatusTransition:${entity.status}:${newStatus}`);
        }

        // Update status
        await TxQueries.updateStatus(tx, entityId, newStatus);

        logger.info(
          { entityId, from: entity.status, to: newStatus },
          'Entity status updated atomically'
        );

        return { previousStatus: entity.status, newStatus };
      },
      { invalidateCachePatterns: ['entity*'] }
    );
  }

  // ============================================
  // EXAMPLE: MULTI-TABLE OPERATION
  // Pattern: Multiple related tables in one TX
  // ============================================

  /**
   * Create entity with related items atomically
   * Demonstrates multi-table atomic operation
   */
  async createEntityWithItems(params: {
    entityName: string;
    items: { name: string }[];
    createdBy: number;
  }): Promise<{ entityId: number; itemIds: number[] }> {
    const { entityName, items, createdBy } = params;

    return this.transactionManager.runInTransaction(
      async (tx) => {
        // 1. Create parent entity
        const entityResult = await tx.execute(
          `INSERT INTO entities (name, status, quota, createdBy, createdAt, updatedAt)
           VALUES (?, 'active', 100, ?, NOW(), NOW())`,
          [entityName, createdBy]
        );
        const entityId = entityResult.insertId;

        // 2. Create all related items
        const itemIds: number[] = [];
        for (const item of items) {
          const itemId = await TxQueries.insertItem(tx, entityId, item.name, createdBy);
          itemIds.push(itemId);
        }

        logger.info(
          { entityId, itemCount: itemIds.length },
          'Entity with items created atomically'
        );

        return { entityId, itemIds };
      },
      { invalidateCachePatterns: ['entity*', 'item*'] }
    );
  }

  // ============================================
  // HELPER: Get limit check result
  // Useful when you need to check before starting operation
  // ============================================

  /**
   * Check limit without performing operation
   * Use this for pre-flight checks in UI
   */
  async checkLimitOnly(parentId: number): Promise<LimitCheckResult> {
    return this.transactionManager.runInTransaction(async (tx) => {
      return TxQueries.checkItemLimit(tx, parentId);
    });
  }
}
