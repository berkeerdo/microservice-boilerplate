# Atomic Operations Pattern

## Genel Bakış

Bu pattern, race condition'ları ve veri bütünlüğü sorunlarını önlemek için transaction tabanlı atomik operasyonlar sağlar.

## Problem

Eşzamanlı isteklerde check-then-act pattern'i race condition'lara yol açar:

```
İstek A: Limit kontrolü (count=9, max=10) ✓
İstek B: Limit kontrolü (count=9, max=10) ✓
İstek A: Insert (count 10 oldu) ✓
İstek B: Insert (count 11 oldu) ❌ Limit aşıldı!
```

## Çözüm

Transaction + FOR UPDATE lock kullanarak atomik operasyonlar:

```
İstek A: BEGIN TX → Satır kilitle → Kontrol (9/10) → Insert → COMMIT
İstek B: BEGIN TX → Satır kilitle (BEKLE) → Kontrol (10/10) → REDDET
```

## Mimari

```
┌─────────────────────────────────────────────────────────────┐
│                        USE CASE                             │
│  (İş mantığı, doğrulama, orkestrasyon)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │ çağırır
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              ATOMIC OPERATION SERVICE                        │
│  (Üst düzey atomik operasyonlar)                            │
│  - addItem()                                                │
│  - createEntityWithItems()                                  │
│  - updateStatus()                                           │
└─────────────────────┬───────────────────────────────────────┘
                      │ kullanır
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              TRANSACTION MANAGER                             │
│  (Cache invalidation ile transaction wrapper)               │
│  - runInTransaction()                                       │
│  - invalidateCachePatterns()                                │
└─────────────────────┬───────────────────────────────────────┘
                      │ kullanır
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              TX QUERIES                                      │
│  (FOR UPDATE ile tekrar kullanılabilir alt düzey sorgular)  │
│  - checkItemLimit()                                         │
│  - insertItem()                                             │
│  - getEntityForUpdate()                                     │
└─────────────────────────────────────────────────────────────┘
```

## Dosyalar

| Dosya | Amaç |
|-------|------|
| `src/infra/db/TransactionManager.ts` | Transaction wrapper (GENERİK) |
| `src/infra/db/TransactionQueries.ts` | Domain'e özel sorgular (ÖZELLEŞTİR) |
| `src/application/services/AtomicOperationService.ts` | Üst düzey operasyonlar (ÖZELLEŞTİR) |

## Uygulama Rehberi

### Adım 1: Domain Sorgularını Tanımla (TxQueries)

```typescript
// src/infra/db/TransactionQueries.ts
export const TxQueries = {
  // Örtük kilit ile sayım sorgusu
  async countOrders(tx: TransactionContext, customerId: number): Promise<number> {
    const [result] = await tx.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM orders WHERE customerId = ? AND status != 'cancelled'`,
      [customerId]
    );
    return result?.count ?? 0;
  },

  // FOR UPDATE kilidi ile limit kontrolü (race condition'ı önler)
  async checkOrderLimit(tx: TransactionContext, customerId: number): Promise<LimitCheckResult> {
    // Müşteri satırını kilitle
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

  // Insert sorgusu
  async insertOrder(tx: TransactionContext, customerId: number, data: OrderData): Promise<number> {
    const result = await tx.execute(
      `INSERT INTO orders (customerId, total, status, createdAt) VALUES (?, ?, 'pending', NOW())`,
      [customerId, data.total]
    );
    return result.insertId;
  },
};
```

### Adım 2: Atomik Operasyonları Oluştur (AtomicOperationService)

```typescript
// src/application/services/AtomicOperationService.ts
export class AtomicOperationService {
  constructor(private readonly transactionManager: TransactionManager) {}

  async createOrder(customerId: number, data: OrderData): Promise<CreateOrderResult> {
    return this.transactionManager.runInTransaction(
      async (tx) => {
        // 1. Limiti atomik olarak kontrol et
        const { canAdd, maxAllowed } = await TxQueries.checkOrderLimit(tx, customerId);
        if (!canAdd) {
          throw new ForbiddenError(`order.limitReached:${maxAllowed}`);
        }

        // 2. Sipariş ekle (kilit hala tutuluyor)
        const orderId = await TxQueries.insertOrder(tx, customerId, data);

        // 3. Sipariş kalemlerini ekle
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

### Adım 3: Use Case'de Kullan

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
    // Doğrulama (salt okunur, transaction'dan önce)
    const customer = await this.customerRepository.findById(input.customerId);
    if (!customer) throw new NotFoundError('customer.notFound');

    // Atomik operasyon (limit kontrolü + insert)
    const result = await this.atomicOps.createOrder(input.customerId, {
      total: input.total,
      items: input.items,
    });

    return { orderId: result.orderId };
  }
}
```

### Adım 4: DI Container'a Kaydet

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

## Yaygın Pattern'ler

### Pattern 1: Limit Kontrolü + Insert

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

### Pattern 2: Duplike Önleme

```typescript
async createInvite(workspaceId: number, email: string): Promise<InviteResult> {
  return this.transactionManager.runInTransaction(async (tx) => {
    // Mevcut daveti kilitle ve kontrol et
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

### Pattern 3: Durum Geçişi

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

### Pattern 4: Çoklu Tablo Atomik Operasyonu

```typescript
async acceptInvite(inviteId: number, userId: number): Promise<AcceptResult> {
  return this.transactionManager.runInTransaction(async (tx) => {
    // 1. Workspace limitini kontrol et
    const { canAdd } = await TxQueries.checkWorkspaceMemberLimit(tx, workspaceId);
    if (!canAdd) throw new ForbiddenError('workspace.memberLimitReached');

    // 2. Workspace üyesi ekle
    const memberId = await TxQueries.insertWorkspaceMember(tx, workspaceId, userId);

    // 3. Takımlara ekle
    for (const teamId of invite.teamIds) {
      await TxQueries.insertTeamMember(tx, teamId, userId);
    }

    // 4. Daveti kabul edildi olarak işaretle
    await TxQueries.markInviteAccepted(tx, inviteId, userId);

    return { memberId, teamsJoined: invite.teamIds.length };
  });
}
```

## En İyi Pratikler

### YAPILMASI GEREKENLER

- ✅ FOR UPDATE'i limiti kontrol eden satırda kullan (parent/owner satırı)
- ✅ Kilit süresini minimize etmek için transaction'ları kısa tut
- ✅ Salt okunur operasyonları transaction'dan ÖNCE doğrula
- ✅ Bağlamla birlikte açıklayıcı hata mesajları kullan
- ✅ Commit sonrası ilgili cache pattern'lerini invalidate et
- ✅ Hata ayıklama için debug/info seviyesinde logla

### YAPILMAMASI GEREKENLER

- ❌ Transaction içinde harici servisleri çağırma (HTTP, email)
- ❌ Kullanıcı girdisi beklerken transaction'ları açık tutma
- ❌ Transaction'ları iç içe kullanma (ilgili operasyonlar için tek transaction kullan)
- ❌ Yeniden aktivasyonu unutma (soft-delete senaryoları)
- ❌ Gerekenden fazla satır kilitleme

## Hata Yönetimi

```typescript
// AtomicOperationService içinde
async addItem(...): Promise<Result> {
  return this.transactionManager.runInTransaction(async (tx) => {
    // Burada fırlatılan hatalar otomatik olarak transaction'ı rollback eder
    const { canAdd } = await TxQueries.checkLimit(tx, parentId);
    if (!canAdd) {
      throw new ForbiddenError('item.limitReached'); // Rollback gerçekleşir
    }
    // ...
  });
}

// TransactionManager rollback'i otomatik yönetir
async runInTransaction<T>(callback): Promise<T> {
  try {
    const result = await withTransaction(async (tx) => callback(context));
    await this.invalidateCachePatterns(options?.invalidateCachePatterns);
    return result;
  } catch (error) {
    logger.error({ err: error }, 'Transaction başarısız, rollback yapılıyor');
    throw error; // Rollback zaten gerçekleşti
  }
}
```

## Test

```typescript
describe('AtomicOperationService', () => {
  it('eşzamanlı limit ihlallerini önlemeli', async () => {
    // Hazırlık: limit=1 ile parent oluştur
    const parentId = await createTestParent({ maxItems: 1 });

    // Çalıştır: 2 item'ı eşzamanlı eklemeye çalış
    const results = await Promise.allSettled([
      atomicOps.addItem(parentId, 'Item 1', userId),
      atomicOps.addItem(parentId, 'Item 2', userId),
    ]);

    // Doğrula: Biri başarılı olmalı, biri başarısız
    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason.message).toContain('limitReached');
  });
});
```

## Ne Zaman Kullanılmalı

| Senaryo | Atomik Operasyon Kullan? |
|---------|-------------------------|
| Limit kontrolü sonra insert | ✅ Evet |
| Duplike girişleri önleme | ✅ Evet |
| Durum geçişleri | ✅ Evet |
| Çoklu tablo tutarlı yazımları | ✅ Evet |
| Basit tekli insert | ❌ Hayır |
| Salt okunur sorgular | ❌ Hayır |
| Harici API çağrıları | ❌ Hayır (TX dışında yap) |
