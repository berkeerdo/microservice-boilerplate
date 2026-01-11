# Mimari Genel Bakış

Bu boilerplate **Clean Architecture** prensiplerini takip eder. Amaç: test edilebilir, bakımı kolay ve framework-agnostic bir yapı.

## Katman Yapısı

```
┌─────────────────────────────────────────────────────────────┐
│                      Dış Dünya                              │
│              (HTTP, gRPC, Queue, CLI)                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   PRESENTATION KATMANI                      │
│                      (src/app/)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Routes    │  │ Middlewares │  │      Plugins        │ │
│  │  handlers   │  │  auth, cors │  │  swagger, helmet    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   APPLICATION KATMANI                       │
│                   (src/application/)                        │
│  ┌─────────────────────┐  ┌───────────────────────────────┐│
│  │      Use Cases      │  │         Providers             ││
│  │     İş Mantığı      │  │   External Servis Adapterleri ││
│  │ CreateUser, GetUser │  │   Email, Payment, Storage     ││
│  └─────────────────────┘  └───────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     DOMAIN KATMANI                          │
│                     (src/domain/)                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                      Entities                           ││
│  │              İş Nesneleri ve Kuralları                  ││
│  │                  User, Order, Product                   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  INFRASTRUCTURE KATMANI                     │
│                      (src/infra/)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │    DB    │ │  Queue   │ │  Logger  │ │   Monitoring   │ │
│  │  MySQL   │ │ RabbitMQ │ │   Pino   │ │ Sentry, OTEL   │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Bağımlılık Kuralı

**Bağımlılıklar her zaman içe doğru akar:**

- `app/` → `application/` → `domain/` ✅
- `domain/` → `application/` ❌ YASAK
- `application/` → `app/` ❌ YASAK

Domain katmanı hiçbir şeye bağımlı olmamalı.

## Klasör Açıklamaları

### `src/app/` - Presentation Katmanı

HTTP/gRPC isteklerini karşılar ve yanıtlar. **Framework-specific** kod burada yaşar.

| Klasör | Amaç |
|--------|------|
| `routes/` | Endpoint tanımları ve handler'lar |
| `middlewares/` | Auth, validation, rate limiting |
| `plugins/` | Fastify plugin'leri (swagger, helmet) |

```typescript
// routes/userRoutes.ts
fastify.post('/users', {
  handler: async (request) => {
    const useCase = container.resolve(CreateUserUseCase);
    return useCase.execute(request.body);
  }
});
```

### `src/application/` - Application Katmanı

**Use Cases** (iş mantığı operasyonları) burada yaşar. Orkestrasyon katmanı.

| Klasör | Amaç |
|--------|------|
| `useCases/` | Her iş operasyonu için bir class |
| `providers/` | External servis adapter'ları |

```typescript
// useCases/CreateUserUseCase.ts
export class CreateUserUseCase extends BaseUseCase<CreateUserInput, User> {
  constructor(
    private userRepo: IUserRepository,
    private emailProvider: IEmailProvider,
    logger: Logger
  ) {
    super(logger);
  }

  async execute(input: CreateUserInput): Promise<User> {
    const user = await this.userRepo.create(input);
    await this.emailProvider.sendWelcome(user.email);
    return user;
  }
}
```

### `src/domain/` - Domain Katmanı

**Saf iş entity'leri**. Framework veya infrastructure bağımlılığı YOK.

```typescript
// models/User.ts
export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}
```

### `src/infra/` - Infrastructure Katmanı

Dış dünya ile iletişim. Database, cache, queue, monitoring.

| Klasör | Amaç |
|--------|------|
| `db/repositories/` | Data access katmanı |
| `db/cache/` | Cache key üretimi |
| `db/migrations/` | Database migration'ları |
| `logger/` | Pino structured logging |
| `monitoring/` | Sentry + OpenTelemetry |
| `queue/` | RabbitMQ entegrasyonu |
| `shutdown/` | Graceful shutdown yönetimi |

## Dependency Injection

`awilix` kullanılarak IoC container yönetilir (decorator-free, reflect-metadata gerektirmez):

```typescript
// container.ts
import { createContainer, asValue, asClass, asFunction, InjectionMode } from 'awilix';

export const TOKENS = {
  UserRepository: 'userRepository',
  CreateUserUseCase: 'createUserUseCase',
};

export const container = createContainer({
  injectionMode: InjectionMode.PROXY,
  strict: true,
});

export function registerDependencies() {
  container.register({
    logger: asValue(logger),
    userRepository: asClass(UserRepository).singleton(),
    createUserUseCase: asFunction(
      ({ userRepository, logger }) => new CreateUserUseCase(userRepository, logger)
    ).transient(),
  });
}
```

## Request Akışı

```
HTTP Request
     │
     ▼
┌─────────────────┐
│  Correlation ID │ ← Her request'e unique ID
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Rate Limiter  │ ← DoS koruması
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  JWT Auth       │ ← Token doğrulama
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Validation     │ ← Zod şema doğrulama
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Route Handler  │ ← Use Case çağrısı
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Use Case     │ ← İş mantığı
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Repository    │ ← Data access (cached)
└────────┬────────┘
         │
         ▼
    HTTP Response
```

## Neden Bu Yapı?

| Avantaj | Açıklama |
|---------|----------|
| **Test Edilebilirlik** | Use Case'ler mock repository ile test edilebilir |
| **Esneklik** | Fastify'ı Express ile değiştirmek sadece `app/` katmanını etkiler |
| **Bakım Kolaylığı** | Her katmanın net sorumluluğu var |
| **Ölçeklenebilirlik** | Yeni feature eklemek kolay |
