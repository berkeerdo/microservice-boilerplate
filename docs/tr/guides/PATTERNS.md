# Design Patterns Rehberi

Bu boilerplate'te kullanılan design pattern'ların açıklaması ve kullanım örnekleri.

## Circuit Breaker Pattern

**Amaç:** Bir servis başarısız olduğunda, sürekli başarısız istekler yapmak yerine "devreyi açarak" hızlı fail etmek.

**Dosya:** `src/shared/utils/CircuitBreaker.ts`

### Durum Diyagramı

```
         ┌──────────────┐
         │    CLOSED    │ ← Normal çalışma
         │   (Normal)   │
         └──────┬───────┘
                │ failureThreshold aşıldı
                ▼
         ┌──────────────┐
         │     OPEN     │ ← Tüm istekler reddedilir
         │   (Başarısız)│
         └──────┬───────┘
                │ timeout süresi geçti
                ▼
         ┌──────────────┐
         │  HALF_OPEN   │ ← Test istekleri
         │   (Test)     │
         └──────┬───────┘
                │
    ┌───────────┴───────────┐
    │ başarılı              │ başarısız
    ▼                       ▼
  CLOSED                  OPEN
```

### Kullanım

```typescript
import { CircuitBreaker } from '../shared/utils/CircuitBreaker.js';

const externalApiBreaker = new CircuitBreaker('external-api', {
  failureThreshold: 5,    // 5 başarısızlıkta aç
  successThreshold: 2,    // 2 başarılı istekte kapat
  timeout: 60000,         // 60 saniye bekle
});

async function callExternalApi() {
  return externalApiBreaker.execute(async () => {
    const response = await fetch('https://api.external.com/data');
    if (!response.ok) throw new Error('API başarısız');
    return response.json();
  });
}
```

### Ne Zaman Kullanılmalı?

- External API çağrıları
- Database bağlantıları
- Message queue işlemleri
- Mikroservisler arası iletişim

---

## Retry Pattern

**Amaç:** Geçici hatalar için otomatik tekrar deneme mekanizması.

**Dosya:** `src/shared/utils/RetryLogic.ts`

### Kullanım

```typescript
import { RetryLogic, RetryOptions } from '../shared/utils/RetryLogic.js';

const retryOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,      // 1 saniye
  maxDelay: 10000,         // 10 saniye max
  backoffMultiplier: 2,    // Üstel geri çekilme
  retryableErrors: [       // Sadece bu hatalar için retry
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
  ],
};

const retry = new RetryLogic(retryOptions);

async function fetchWithRetry() {
  return retry.execute(async () => {
    const response = await fetch('https://api.example.com');
    return response.json();
  });
}
```

### Üstel Geri Çekilme (Exponential Backoff)

```
Deneme 1: 1000ms bekleme
Deneme 2: 2000ms bekleme
Deneme 3: 4000ms bekleme (max 10000ms)
```

### Circuit Breaker + Retry Birlikte

```typescript
async function resilientApiCall() {
  return circuitBreaker.execute(async () => {
    return retry.execute(async () => {
      return callExternalApi();
    });
  });
}
```

---

## Repository Pattern

**Amaç:** Data access mantığını domain mantığından ayırmak.

**Dosya:** `src/infra/db/repositories/BaseRepository.ts`

### Interface Tanımı

```typescript
export interface IRepository<T> {
  findById(id: number): Promise<T | null>;
  findAll(limit?: number, offset?: number): Promise<T[]>;
  create(entity: Partial<T>): Promise<number>;
  update(id: number, entity: Partial<T>): Promise<boolean>;
  delete(id: number): Promise<boolean>;
}
```

### Somut Implementasyon

```typescript
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users', 'user'); // tableName, cachePrefix
  }

  // Özel metodlar
  async findByEmail(email: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE email = ?';
    const results = await this.query(sql, [email]);
    return results[0] || null;
  }
}
```

### Neden Repository Pattern?

| Avantaj | Açıklama |
|---------|----------|
| Test Edilebilirlik | Use case mock repository ile test edilebilir |
| Esneklik | MySQL'den PostgreSQL'e geçiş sadece repository'yi etkiler |
| Cache | Cache mantığı repository içinde merkezi |
| Sorgu optimizasyonu | SQL optimizasyonları tek yerde |

---

## Dependency Injection Pattern

**Amaç:** Bağımlılıkları dışarıdan inject ederek gevşek bağlantı sağlamak.

**Kütüphane:** `awilix` (decorator-free, reflect-metadata gerektirmez)

### Container Kurulumu

```typescript
// container.ts
import { createContainer, asValue, asClass, asFunction, InjectionMode } from 'awilix';

export const TOKENS = {
  UserRepository: 'userRepository',
  EmailProvider: 'emailProvider',
  CreateUserUseCase: 'createUserUseCase',
};

export const container = createContainer({
  injectionMode: InjectionMode.PROXY,
  strict: true,
});

export function registerDependencies() {
  container.register({
    userRepository: asClass(UserRepository).singleton(),
    emailProvider: asFunction(() =>
      config.NODE_ENV === 'test'
        ? new MockEmailProvider()
        : new SendGridEmailProvider(config.SENDGRID_API_KEY)
    ).singleton(),
  });
}
```

### Injection Türleri

```typescript
// 1. Constructor Injection (Önerilen)
class CreateUserUseCase {
  constructor(
    private userRepo: IUserRepository,
    private emailProvider: IEmailProvider
  ) {}
}

// 2. Factory Pattern (Awilix ile)
container.register({
  createUserUseCase: asFunction(
    ({ userRepository, emailProvider }) => new CreateUserUseCase(userRepository, emailProvider)
  ).transient(),
});

// 3. Çözümleme
const useCase = container.resolve<CreateUserUseCase>(TOKENS.CreateUserUseCase);
```

---

## Middleware Pattern

**Amaç:** Request/Response pipeline'ına kesişen endişeler (cross-cutting concerns) eklemek.

### Fastify Hook Sırası

```
onRequest → preParsing → preValidation → preHandler → handler
                                                          │
onSend ← preSerialization ←────────────────────────────────┘
  │
  ▼
onResponse
```

### Özel Middleware Örneği

```typescript
// Zamanlama middleware'i
export async function registerTiming(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', async (request) => {
    request.startTime = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - request.startTime;
    request.log.info({ duration }, 'İstek tamamlandı');
  });
}
```

### Middleware Sırası (Bu Boilerplate)

1. **Correlation ID** - Request takibi
2. **Rate Limiter** - DoS koruması
3. **JWT Auth** - Kimlik doğrulama
4. **Validation** - Input doğrulama
5. **Handler** - İş mantığı

---

## Graceful Shutdown Pattern

**Amaç:** Servis kapatılırken açık bağlantıları düzgün kapatmak.

**Dosya:** `src/infra/shutdown/gracefulShutdown.ts`

### Kapatma Sırası

```
SIGTERM alındı
       │
       ▼
┌──────────────────┐
│ Yeni bağlantıları│
│ kabul etmeyi dur │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Aktif isteklerin │
│ bitmesini bekle  │
│     (30s)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Kaynakları kapat:│
│ - HTTP server    │
│ - Database       │
│ - Queue          │
│ - OpenTelemetry  │
│ - Sentry         │
└────────┬─────────┘
         │
         ▼
    Process çıkış
```

### Kullanım

```typescript
import { gracefulShutdown } from './infra/shutdown/gracefulShutdown.js';

// Signal handler'ları kur
gracefulShutdown.setupSignalHandlers();

// Kaynakları register et (LIFO sıra)
gracefulShutdown.register('database', async () => {
  await db.close();
});

gracefulShutdown.register('queue', async () => {
  await queue.close();
});

// Fastify için özel metod
gracefulShutdown.registerFastify(server);
```

---

## Error Handling Pattern

**Amaç:** Tutarlı hata yanıtları ve merkezi hata yönetimi.

**Dosya:** `src/shared/errors/errorMapper.ts`

### Özel Hata Sınıfları

```typescript
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} bulunamadı`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super(401, 'UNAUTHORIZED', 'Kimlik doğrulama gerekli');
  }
}
```

### Hata Handler

```typescript
// Fastify hata handler
export function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
    return;
  }

  // Beklenmeyen hata
  request.log.error(error);
  captureException(error);

  reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: 'Beklenmeyen bir hata oluştu',
  });
}
```

---

## Pattern Seçim Rehberi

| Durum | Kullanılacak Pattern |
|-------|---------------------|
| External API çağrısı | Circuit Breaker + Retry |
| Database işlemi | Repository |
| Kesişen endişe | Middleware |
| Bağımlılık yönetimi | Dependency Injection |
| Servis kapatma | Graceful Shutdown |
| Hata yönetimi | Error Handler |
