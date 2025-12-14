# Design Patterns Rehberi

Bu boilerplate'te kullanılan design pattern'ların açıklaması ve kullanım örnekleri.

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

### Cursor-Based Pagination

Büyük veri setleri için offset yerine cursor pagination kullanın:

```typescript
// Cursor pagination - büyük veri setleri için daha verimli
const result = await userRepository.findAllCursor(100, lastId);
// Döner: { data: User[], hasMore: boolean, nextCursor?: string }

// Offset pagination - büyük offset'lerde yavaş
const users = await userRepository.findAll(100, 5000); // Yavaş!
```

**Cursor pagination ne zaman kullanılmalı:**
- 10.000+ satırlık veri setleri
- Infinite scroll UI pattern'leri
- Sık değişen gerçek zamanlı veriler

### Slow Query Logging

BaseRepository, timeout eşiğinin %80'ini aşan sorguları otomatik olarak loglar:

```typescript
// Sorgu timeout'a yaklaştığında otomatik uyarı
// Log: { table, durationMs, thresholdMs, timeoutMs, sql }
logger.warn('Slow query detected in users');
```

Bu, timeout'lar oluşmadan önce performans sorunlarını tespit etmeye yardımcı olur.

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

**Amaç:** i18n destekli tutarlı hata yanıtları ve merkezi hata yönetimi.

**Dosyalar:**
- `src/shared/errors/errorHandler.ts` - HTTP hata handler
- `src/shared/errors/grpcErrorHandler.ts` - gRPC hata handler + HttpStatus enum
- `src/shared/errors/errorSanitizer.ts` - i18n çeviri
- `src/shared/errors/AppError.ts` - Özel hata sınıfları

### Mimari

```
Hata Akışı (HTTP)                    Hata Akışı (gRPC)
      │                                    │
      ▼                                    ▼
┌─────────────┐                    ┌─────────────┐
│ AppError    │                    │ AppError    │
│ ZodError    │                    │ fırlatılır  │
│ JWT Error   │                    └──────┬──────┘
└──────┬──────┘                           │
       │                                  ▼
       ▼                          ┌───────────────────┐
┌───────────────────┐             │createGrpcError    │
│ errorHandler.ts   │             │Response()         │
│ + sanitizeError   │             │+ sanitizeError    │
│ + HttpStatus enum │             └─────────┬─────────┘
│ + t() i18n için   │                       │
└─────────┬─────────┘                       ▼
          │                         Çevrilmiş mesaj
          ▼                         RequestContext ile
   RFC 7807 Response
```

### Özel Hata Sınıfları

```typescript
// src/shared/errors/AppError.ts
export class AppError extends Error {
  public readonly isOperational = true; // Kullanıcıya göstermek güvenli

  constructor(
    public statusCode: number,
    public code: string,
    message: string,  // i18n key olabilir: 'auth.invalidCredentials'
    public details?: unknown
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, 'NOT_FOUND', message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'auth.unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}
```

### HttpStatus Enum

```typescript
// src/shared/errors/grpcErrorHandler.ts
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;
```

### HTTP Hata Handler (i18n ile)

```typescript
// src/shared/errors/errorHandler.ts
import { sanitizeErrorMessage } from './errorSanitizer.js';
import { HttpStatus } from './grpcErrorHandler.js';
import { t, type TranslationKey } from '../i18n/index.js';

export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const requestId = request.id;

  // 1. AppError - sanitizeErrorMessage ile çevir
  if (error instanceof AppError) {
    const message = sanitizeErrorMessage(error);
    reply.status(error.statusCode).send({
      error: error.code,
      message,  // Çevrilmiş!
      statusCode: error.statusCode,
      requestId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // 2. ZodError - i18n ile validasyon
  if (error instanceof ZodError) {
    const message = t('validation.failed' as TranslationKey);
    reply.status(HttpStatus.BAD_REQUEST).send({
      error: 'VALIDATION_ERROR',
      message,
      statusCode: HttpStatus.BAD_REQUEST,
      details: formatZodError(error),
    });
    return;
  }

  // 3. JWT hataları - i18n mesajları
  if (error.name === 'TokenExpiredError') {
    reply.status(HttpStatus.UNAUTHORIZED).send({
      error: 'AUTHENTICATION_ERROR',
      message: t('auth.tokenExpired' as TranslationKey),
    });
    return;
  }

  // 4. Bilinmeyen hatalar - Sentry + genel mesaj
  captureException(error);
  const message = isDev ? error.message : sanitizeErrorMessage(error, 'common.internalError');
  reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
    error: 'INTERNAL_ERROR',
    message,
  });
}
```

### gRPC Hata Handler

```typescript
// src/shared/errors/grpcErrorHandler.ts
export function createGrpcErrorResponse(error: unknown, fallbackKey: string) {
  const message = sanitizeErrorMessage(error, fallbackKey);
  const statusCode = error instanceof AppError ? error.statusCode : HttpStatus.INTERNAL_SERVER_ERROR;

  return {
    success: false,
    error: message,
    status_code: statusCode,
  };
}

// gRPC handler'da kullanım
} catch (error) {
  callback(null, createGrpcErrorResponse(error, 'auth.loginFailed'));
}
```

### Hata Yanıt Formatı (RFC 7807 ilhamlı)

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Doğrulama başarısız oldu.",
  "statusCode": 400,
  "details": [
    { "field": "email", "message": "Geçerli bir e-posta adresi giriniz." }
  ],
  "requestId": "abc-123",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### i18n Çeviri Akışı

```
1. AppError i18n key ile fırlatılır: throw new UnauthorizedError('auth.invalidCredentials')
2. errorHandler yakalar
3. sanitizeErrorMessage() çağrılır:
   - RequestContext.getLocale() ile locale alınır
   - locales/{locale}.json'dan çeviri bulunur
   - Çevrilmiş mesaj döndürülür
4. Yanıt çevrilmiş mesajla gönderilir
```

### En İyi Pratikler

| Yapın | Yapmayın |
|-------|----------|
| `HttpStatus.BAD_REQUEST` kullanın | Sihirli sayılar `400` kullanmayın |
| i18n key'leri mesaj olarak kullanın | Kullanıcıya gösterilecek string'leri hardcode etmeyin |
| `sanitizeErrorMessage()` kullanın | Ham error.message döndürmeyin |
| `isOperational` flag kullanın | Internal hataları expose etmeyin |
| Non-operational için Sentry'ye logla | Hataları sessizce yutmayın |

---

## Pattern Seçim Rehberi

| Durum | Kullanılacak Pattern |
|-------|---------------------|
| Database işlemi | Repository |
| Kesişen endişe | Middleware |
| Bağımlılık yönetimi | Dependency Injection |
| Servis kapatma | Graceful Shutdown |
| Hata yönetimi | Error Handler |
