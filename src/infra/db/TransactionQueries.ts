/**
 * Transaction Queries Template
 * Reusable query helpers for atomic operations within transactions
 *
 * IMPORTANT: This is a TEMPLATE file. Copy and customize for your domain.
 *
 * These helpers ensure check-then-act operations happen atomically
 * by using SELECT ... FOR UPDATE locks where needed.
 *
 * Pattern Usage:
 * 1. Define domain-specific queries here (e.g., countProducts, checkInventoryLimit)
 * 2. Use FOR UPDATE locks for queries that will be followed by writes
 * 3. Call these from AtomicOperationService for high-level atomic operations
 *
 * Example:
 * ```typescript
 * await transactionManager.runInTransaction(async (tx) => {
 *   // Check limit atomically with lock
 *   const { canAdd } = await TxQueries.checkInventoryLimit(tx, warehouseId);
 *   if (!canAdd) throw new ForbiddenError('Limit reached');
 *
 *   // Insert within same TX (lock prevents race condition)
 *   await tx.execute('INSERT INTO inventory_items...', [...]);
 * });
 * ```
 */
import type { TransactionContext } from './TransactionManager.js';

/**
 * Result of a count query
 */
interface CountResult {
  count: number;
}

/**
 * Result of an exists query
 */
interface ExistsResult {
  exists: number;
}

/**
 * Limit check result - use for quota/capacity checks
 */
export interface LimitCheckResult {
  currentCount: number;
  maxAllowed: number;
  canAdd: boolean;
}

/**
 * Transaction Queries - Atomic query helpers
 *
 * CUSTOMIZE THIS FOR YOUR DOMAIN:
 * - Replace example queries with your domain-specific ones
 * - Add FOR UPDATE locks for check-then-act patterns
 * - Keep queries simple and focused (SRP)
 */
export const TxQueries = {
  // ============================================
  // COUNT QUERIES (with FOR UPDATE lock)
  // ============================================

  /**
   * Example: Count items with lock
   * Replace with your domain entity (e.g., countOrderItems, countSubscriptions)
   */
  async countItems(tx: TransactionContext, parentId: number): Promise<number> {
    const [result] = await tx.query<CountResult>(
      `SELECT COUNT(*) as count FROM items WHERE parentId = ? AND isActive = 1`,
      [parentId]
    );
    return result?.count ?? 0;
  },

  // ============================================
  // LIMIT CHECK QUERIES (atomic check)
  // ============================================

  /**
   * Example: Check item limit atomically
   * Replace with your domain limit (e.g., checkOrderLimit, checkStorageQuota)
   *
   * Pattern:
   * 1. SELECT ... FOR UPDATE to lock the parent row
   * 2. Count current items
   * 3. Return whether can add more
   */
  async checkItemLimit(tx: TransactionContext, parentId: number): Promise<LimitCheckResult> {
    // Lock parent row to prevent concurrent modifications
    const [parent] = await tx.query<{ maxItems: number }>(
      `SELECT maxItems FROM parents WHERE id = ? FOR UPDATE`,
      [parentId]
    );

    if (!parent) {
      return { currentCount: 0, maxAllowed: 0, canAdd: false };
    }

    const currentCount = await this.countItems(tx, parentId);

    return {
      currentCount,
      maxAllowed: parent.maxItems,
      canAdd: currentCount < parent.maxItems,
    };
  },

  // ============================================
  // EXISTS QUERIES
  // ============================================

  /**
   * Example: Check if entity exists
   * Replace with your domain check (e.g., userExists, productExists)
   */
  async entityExists(tx: TransactionContext, entityId: number): Promise<boolean> {
    const [result] = await tx.query<ExistsResult>(
      `SELECT EXISTS(SELECT 1 FROM entities WHERE id = ? AND isDelete = 0) as \`exists\``,
      [entityId]
    );
    return result?.exists === 1;
  },

  /**
   * Example: Check for duplicate (unique constraint check)
   * Use this pattern for preventing duplicates within transaction
   */
  async hasDuplicate(
    tx: TransactionContext,
    parentId: number,
    uniqueField: string
  ): Promise<boolean> {
    const [result] = await tx.query<ExistsResult>(
      `SELECT EXISTS(
        SELECT 1 FROM items WHERE parentId = ? AND uniqueField = ? AND isActive = 1
      ) as \`exists\``,
      [parentId, uniqueField]
    );
    return result?.exists === 1;
  },

  // ============================================
  // FETCH QUERIES (with optional lock)
  // ============================================

  /**
   * Example: Get entity with FOR UPDATE lock
   * Use when you need to read-then-write atomically
   */
  async getEntityForUpdate(
    tx: TransactionContext,
    entityId: number
  ): Promise<{ id: number; status: string; quota: number } | null> {
    const [entity] = await tx.query<{ id: number; status: string; quota: number }>(
      `SELECT id, status, quota FROM entities WHERE id = ? FOR UPDATE`,
      [entityId]
    );
    return entity ?? null;
  },

  /**
   * Example: Get related entity info
   */
  async getItemWithParent(
    tx: TransactionContext,
    itemId: number
  ): Promise<{ itemId: number; parentId: number; itemName: string } | null> {
    const [result] = await tx.query<{ itemId: number; parentId: number; itemName: string }>(
      `SELECT id as itemId, parentId, name as itemName FROM items WHERE id = ? AND isDelete = 0`,
      [itemId]
    );
    return result ?? null;
  },

  // ============================================
  // INSERT QUERIES
  // ============================================

  /**
   * Example: Insert item
   * Returns insertId for use in subsequent operations
   */
  async insertItem(
    tx: TransactionContext,
    parentId: number,
    name: string,
    createdBy: number
  ): Promise<number> {
    const result = await tx.execute(
      `INSERT INTO items (parentId, name, createdBy, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, NOW(), NOW())`,
      [parentId, name, createdBy]
    );
    return result.insertId;
  },

  // ============================================
  // UPDATE QUERIES
  // ============================================

  /**
   * Example: Soft delete item
   */
  async softDeleteItem(tx: TransactionContext, itemId: number): Promise<void> {
    await tx.execute(`UPDATE items SET isActive = 0, updatedAt = NOW() WHERE id = ?`, [itemId]);
  },

  /**
   * Example: Reactivate item
   */
  async reactivateItem(tx: TransactionContext, itemId: number): Promise<void> {
    await tx.execute(`UPDATE items SET isActive = 1, updatedAt = NOW() WHERE id = ?`, [itemId]);
  },

  /**
   * Example: Update status
   */
  async updateStatus(tx: TransactionContext, entityId: number, status: string): Promise<void> {
    await tx.execute(`UPDATE entities SET status = ?, updatedAt = NOW() WHERE id = ?`, [
      status,
      entityId,
    ]);
  },
};

export type TransactionQueries = typeof TxQueries;
