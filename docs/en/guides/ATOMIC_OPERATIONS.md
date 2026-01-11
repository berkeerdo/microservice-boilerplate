# Atomic Operations Pattern

## Overview

This pattern provides transaction-based atomic operations to prevent race conditions and data integrity issues.

## Problem

In concurrent requests, the check-then-act pattern leads to race conditions:

```
Request A: Check limit (count=9, max=10) ✓
Request B: Check limit (count=9, max=10) ✓
Request A: Insert (count becomes 10) ✓
Request B: Insert (count becomes 11) ❌ Limit exceeded!
```

## Solution

Atomic operations using Transaction + FOR UPDATE lock:

```
Request A: BEGIN TX → Lock row → Check (9/10) → Insert → COMMIT
Request B: BEGIN TX → Lock row (WAIT) → Check (10/10) → REJECT
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        USE CASE                             │
│  (Business logic, validation, orchestration)                │
└─────────────────────┬───────────────────────────────────────┘
                      │ calls
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              ATOMIC OPERATION SERVICE                        │
│  (High-level atomic operations)                             │
│  - addItem()                                                │
│  - createEntityWithItems()                                  │
│  - updateStatus()                                           │
└─────────────────────┬───────────────────────────────────────┘
                      │ uses
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              TRANSACTION MANAGER                             │
│  (Transaction wrapper with cache invalidation)              │
│  - runInTransaction()                                       │
│  - invalidateCachePatterns()                                │
└─────────────────────┬───────────────────────────────────────┘
                      │ uses
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              TX QUERIES                                      │
│  (Reusable low-level queries with FOR UPDATE)               │
│  - checkItemLimit()                                         │
│  - insertItem()                                             │
│  - getEntityForUpdate()                                     │
└─────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `src/infra/db/TransactionManager.ts` | Transaction wrapper (GENERIC) |
| `src/infra/db/TransactionQueries.ts` | Domain-specific queries (CUSTOMIZE) |
| `src/application/services/AtomicOperationService.ts` | High-level operations (CUSTOMIZE) |

## Implementation Guide

### Step 1: Define Your Domain Queries (TxQueries)

```typescript
// src/infra/db/TransactionQueries.ts
export const TxQueries = {
  // Count query with implicit lock
  async countOrders(tx: TransactionContext, customerId: number): Promise<number> {
    const [result] = await tx.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM orders WHERE customerId = ? AND status != 'cancelled'`,
      [customerId]
    );
    return result?.count ?? 0;
  },

  // Limit check with FOR UPDATE lock (prevents race condition)
  async checkOrderLimit(tx: TransactionContext, customerId: number): Promise<LimitCheckResult> {
    // Lock customer row
    const [customer] = await tx.query<{ maxOrders: number }>(
      `SELECT maxOrders FROM customers WHERE id = ? FOR UPDATE`,
      [customerId]
    );

    if (!customer) return { currentCount: 0, maxAllowed: 0, canAdd: false };

    const currentCount = await this.countOrders(tx, customerId);

    return {
      currentCount,
      maxAllowed: customer.maxOrders,
      canAdd: currentCount < customer.maxOrders,
    };
  },

  // Insert query
  async insertOrder(tx: TransactionContext, customerId: number, data: OrderData): Promise<number> {
    const result = await tx.execute(
      `INSERT INTO orders (customerId, total, status, createdAt) VALUES (?, ?, 'pending', NOW())`,
      [customerId, data.total]
    );
    return result.insertId;
  },
};
```

### Step 2: Create Atomic Operations (AtomicOperationService)

```typescript
// src/application/services/AtomicOperationService.ts
export class AtomicOperationService {
  constructor(private readonly transactionManager: TransactionManager) {}

  async createOrder(customerId: number, data: OrderData): Promise<CreateOrderResult> {
    return this.transactionManager.runInTransaction(
      async (tx) => {
        // 1. Check limit atomically
        const { canAdd, maxAllowed } = await TxQueries.checkOrderLimit(tx, customerId);
        if (!canAdd) {
          throw new ForbiddenError(`order.limitReached:${maxAllowed}`);
        }

        // 2. Insert order (lock still held)
        const orderId = await TxQueries.insertOrder(tx, customerId, data);

        // 3. Insert order items
        for (const item of data.items) {
          await TxQueries.insertOrderItem(tx, orderId, item);
        }

        return { orderId, customerId };
      },
      { invalidateCachePatterns: ['order*', 'customer*'] }
    );
  }
}
```

### Step 3: Use in Use Case

```typescript
// src/application/useCases/order/CreateOrderUseCase.ts
export class CreateOrderUseCase extends BaseUseCase<CreateOrderInput, CreateOrderOutput> {
  constructor(
    private readonly customerRepository: ICustomerRepository,
    private readonly atomicOps: AtomicOperationService,
    logger: Logger
  ) {
    super(logger);
  }

  async execute(input: CreateOrderInput): Promise<CreateOrderOutput> {
    // Validation (read-only, before transaction)
    const customer = await this.customerRepository.findById(input.customerId);
    if (!customer) throw new NotFoundError('customer.notFound');

    // Atomic operation (limit check + insert)
    const result = await this.atomicOps.createOrder(input.customerId, {
      total: input.total,
      items: input.items,
    });

    return { orderId: result.orderId };
  }
}
```

### Step 4: Register in DI Container

```typescript
// src/container/infrastructure.ts
export function registerInfrastructure(container: AwilixContainer<Cradle>): void {
  container.register({
    transactionManager: asClass(TransactionManager).singleton(),
    atomicOperationService: asFunction(
      ({ transactionManager }: Cradle) => new AtomicOperationService(transactionManager)
    ).singleton(),
  });
}

// src/container/types.ts
export interface Cradle {
  transactionManager: TransactionManager;
  atomicOperationService: AtomicOperationService;
  // ...
}
```

## Common Patterns

### Pattern 1: Limit Check + Insert

```typescript
async addMember(teamId: number, userId: number): Promise<AddMemberResult> {
  return this.transactionManager.runInTransaction(async (tx) => {
    const { canAdd } = await TxQueries.checkMemberLimit(tx, teamId);
    if (!canAdd) throw new ForbiddenError('team.memberLimitReached');

    const memberId = await TxQueries.insertMember(tx, teamId, userId);
    return { memberId, teamId, userId };
  });
}
```

### Pattern 2: Duplicate Prevention

```typescript
async createInvite(workspaceId: number, email: string): Promise<InviteResult> {
  return this.transactionManager.runInTransaction(async (tx) => {
    // Lock and check for existing invite
    const [existing] = await tx.query(
      `SELECT id FROM invites WHERE workspaceId = ? AND email = ? AND status = 'pending' FOR UPDATE`,
      [workspaceId, email]
    );
    if (existing) throw new ConflictError('invite.alreadyPending');

    const inviteId = await TxQueries.insertInvite(tx, workspaceId, email);
    return { inviteId };
  });
}
```

### Pattern 3: Status Transition

```typescript
async approveOrder(orderId: number): Promise<ApproveResult> {
  return this.transactionManager.runInTransaction(async (tx) => {
    const order = await TxQueries.getOrderForUpdate(tx, orderId);
    if (!order) throw new NotFoundError('order.notFound');
    if (order.status !== 'pending') throw new ForbiddenError('order.invalidStatus');

    await TxQueries.updateOrderStatus(tx, orderId, 'approved');
    return { orderId, previousStatus: order.status, newStatus: 'approved' };
  });
}
```

### Pattern 4: Multi-Table Atomic Operation

```typescript
async acceptInvite(inviteId: number, userId: number): Promise<AcceptResult> {
  return this.transactionManager.runInTransaction(async (tx) => {
    // 1. Check workspace limit
    const { canAdd } = await TxQueries.checkWorkspaceMemberLimit(tx, workspaceId);
    if (!canAdd) throw new ForbiddenError('workspace.memberLimitReached');

    // 2. Add workspace member
    const memberId = await TxQueries.insertWorkspaceMember(tx, workspaceId, userId);

    // 3. Add to teams
    for (const teamId of invite.teamIds) {
      await TxQueries.insertTeamMember(tx, teamId, userId);
    }

    // 4. Mark invite accepted
    await TxQueries.markInviteAccepted(tx, inviteId, userId);

    return { memberId, teamsJoined: invite.teamIds.length };
  });
}
```

## Best Practices

### DO

- ✅ Use FOR UPDATE on the row that controls the limit (parent/owner row)
- ✅ Keep transactions short to minimize lock duration
- ✅ Validate read-only operations BEFORE the transaction
- ✅ Use descriptive error messages with context
- ✅ Invalidate relevant cache patterns after commit
- ✅ Log operations at debug/info level for troubleshooting

### DON'T

- ❌ Don't call external services (HTTP, email) inside transactions
- ❌ Don't hold transactions open while waiting for user input
- ❌ Don't nest transactions (use single transaction for related operations)
- ❌ Don't forget to handle reactivation (soft-delete scenarios)
- ❌ Don't lock more rows than necessary

## Error Handling

```typescript
// In AtomicOperationService
async addItem(...): Promise<Result> {
  return this.transactionManager.runInTransaction(async (tx) => {
    // Errors thrown here will automatically rollback the transaction
    const { canAdd } = await TxQueries.checkLimit(tx, parentId);
    if (!canAdd) {
      throw new ForbiddenError('item.limitReached'); // Rollback happens
    }
    // ...
  });
}

// TransactionManager handles rollback automatically
async runInTransaction<T>(callback): Promise<T> {
  try {
    const result = await withTransaction(async (tx) => callback(context));
    await this.invalidateCachePatterns(options?.invalidateCachePatterns);
    return result;
  } catch (error) {
    logger.error({ err: error }, 'Transaction failed, rolling back');
    throw error; // Rollback already happened
  }
}
```

## Testing

```typescript
describe('AtomicOperationService', () => {
  it('should prevent concurrent limit violations', async () => {
    // Setup: Create parent with limit=1
    const parentId = await createTestParent({ maxItems: 1 });

    // Execute: Try to add 2 items concurrently
    const results = await Promise.allSettled([
      atomicOps.addItem(parentId, 'Item 1', userId),
      atomicOps.addItem(parentId, 'Item 2', userId),
    ]);

    // Assert: One should succeed, one should fail
    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason.message).toContain('limitReached');
  });
});
```

## When to Use

| Scenario | Use Atomic Operation? |
|----------|----------------------|
| Check limit then insert | ✅ Yes |
| Prevent duplicate entries | ✅ Yes |
| Status transitions | ✅ Yes |
| Multi-table consistent writes | ✅ Yes |
| Simple single insert | ❌ No |
| Read-only queries | ❌ No |
| External API calls | ❌ No (do outside TX) |
