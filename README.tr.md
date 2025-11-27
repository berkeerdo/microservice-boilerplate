# Microservice Boilerplate

Türkçe | [English](README.md)

Production-ready Clean Architecture TypeScript mikroservis şablonu.

## Özellikler

### Mimari
- **Clean Architecture** - Net ayrımla domain-driven design
- **Dependency Injection** - IoC container için tsyringe
- **Type-safe Config** - Zod şema doğrulama

### HTTP & API
- **Fastify** - Yüksek performanslı HTTP sunucu
- **gRPC** - Protocol buffers desteği (aktifleştirmeye hazır)
- **Swagger/OpenAPI** - Otomatik API dokümantasyonu
- **Request Validation** - Zod tabanlı doğrulama middleware

### Güvenlik
- **Helmet** - Güvenlik header'ları
- **CORS** - Yapılandırılabilir whitelist
- **Rate Limiting** - @fastify/rate-limit ile DoS koruması
- **JWT Authentication** - Rol destekli token tabanlı auth

### Gözlemlenebilirlik
- **OpenTelemetry** - Dağıtık tracing ve metrikler
- **Sentry** - Hata takibi ve izleme
- **Correlation ID** - Servisler arası request takibi
- **Pino Logging** - Yapılandırılmış JSON loglar

### Altyapı
- **MySQL** - Redis cache katmanı ile
- **RabbitMQ** - Message queue desteği
- **Graceful Shutdown** - Temiz kaynak temizliği
- **Health Checks** - Liveness ve readiness probe'ları

### Geliştirici Deneyimi
- **TypeScript** - Tam tip güvenliği
- **ESLint + Prettier** - Kod kalitesi
- **Vitest** - Hızlı unit testing
- **Docker** - Production-ready container'lar

## Proje Yapısı

```
src/
├── app/                          # HTTP Katmanı (Presentation)
│   ├── middlewares/              # Request middleware'leri
│   │   ├── auth.ts              # JWT authentication
│   │   ├── correlationId.ts     # Request tracing
│   │   ├── rateLimiter.ts       # Rate limiting
│   │   └── requestValidator.ts  # Zod validation
│   ├── plugins/                  # Fastify plugin'leri
│   │   └── swagger.ts           # OpenAPI docs
│   ├── routes/                   # Route handler'ları
│   └── server.ts                # Server kurulumu
├── application/                  # Application Katmanı (Use Cases)
│   ├── useCases/                # İş mantığı operasyonları
│   └── providers/               # External servis adapter'ları
├── config/                       # Yapılandırma
│   ├── env.schema.ts            # Zod şema
│   └── env.ts                   # Config yükleyici
├── domain/                       # Domain Katmanı (Entities)
│   └── models/                  # İş entity'leri
├── grpc/                         # gRPC Katmanı
│   ├── handlers/                # RPC handler'ları
│   └── protos/                  # Proto tanımları
├── infra/                        # Infrastructure Katmanı
│   ├── db/                      # Veritabanı
│   │   ├── cache/               # Cache key generator
│   │   ├── migrations/          # DB migration'ları
│   │   └── repositories/        # Data access
│   ├── logger/                  # Pino logger
│   ├── monitoring/              # Gözlemlenebilirlik
│   │   ├── sentry.ts            # Hata takibi
│   │   └── tracing.ts           # OpenTelemetry
│   ├── queue/                   # RabbitMQ
│   └── shutdown/                # Graceful shutdown
├── shared/                       # Paylaşılan Kod
│   ├── errors/                  # Hata yönetimi
│   └── utils/                   # Yardımcılar (CircuitBreaker, RetryLogic)
├── container.ts                  # DI kurulumu
└── index.ts                     # Giriş noktası

docs/                             # Dokümantasyon
├── en/                           # İngilizce docs
│   ├── ARCHITECTURE.md
│   └── guides/
└── tr/                           # Türkçe docs
    ├── ARCHITECTURE.md
    └── guides/
```

### Katman Sorumlulukları

| Katman | Klasör | Sorumluluk |
|--------|--------|------------|
| **Presentation** | `app/` | HTTP handler'ları, middleware'ler, doğrulama |
| **Application** | `application/` | Use case'ler, iş orkestrasyonu |
| **Domain** | `domain/` | İş entity'leri, domain mantığı |
| **Infrastructure** | `infra/` | DB, cache, queue, monitoring |

## Hızlı Başlangıç

### 1. Yeni Servis Oluştur

```bash
cp -r microservice-boilerplate my-new-service
cd my-new-service
npm install
```

### 2. Yapılandır

```bash
cp .env.example .env
# .env dosyasını kendi değerlerinle düzenle
```

### 3. Geliştirmeye Başla

```bash
# Redis & RabbitMQ başlat
docker-compose -f docker-compose.dev.yml up -d

# Dev server başlat
npm run dev
```

### 4. Erişim

- **API**: http://localhost:3000
- **Swagger**: http://localhost:3000/docs
- **Health**: http://localhost:3000/health

## Yapılandırma

### Ortam Değişkenleri

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `NODE_ENV` | Ortam | `development` |
| `PORT` | HTTP port | `3000` |
| `SERVICE_NAME` | Servis tanımlayıcı | `microservice` |
| `JWT_SECRET` | JWT imza anahtarı (min 32 karakter) | - |
| `RATE_LIMIT_MAX` | Pencere başına max istek | `100` |
| `OTEL_ENABLED` | OpenTelemetry aktif | `false` |
| `SENTRY_DSN` | Sentry proje DSN | - |

Tam liste için `.env.example` dosyasına bak.

## Kullanım Örnekleri

### Yeni Endpoint Ekleme

```typescript
// src/app/routes/userRoutes.ts
import { FastifyInstance } from 'fastify';
import { createZodValidator, commonSchemas } from '../middlewares/index.js';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  // Public endpoint
  fastify.get('/users/:id', {
    schema: { tags: ['Users'] },
    preHandler: createZodValidator(commonSchemas.id),
    handler: async (request, reply) => {
      const { id } = request.params as { id: number };
      // ... kullanıcı getir
    },
  });

  // Protected endpoint
  fastify.post('/users', {
    schema: { tags: ['Users'], security: [{ bearerAuth: [] }] },
    preHandler: [
      fastify.authenticate,
      createZodValidator(createUserSchema),
    ],
    handler: async (request, reply) => {
      // JWT'den request.userId mevcut
      // ... kullanıcı oluştur
    },
  });
}

// src/app/routes/index.ts içinde register et
fastify.register(userRoutes, { prefix: '/api/v1/users' });
```

### DI Container Kullanımı

```typescript
// src/container.ts
export const TOKENS = {
  UserRepository: 'UserRepository',
  CreateUserUseCase: 'CreateUserUseCase',
} as const;

export function registerDependencies(): DependencyContainer {
  container.registerSingleton(TOKENS.UserRepository, UserRepository);
  container.register(TOKENS.CreateUserUseCase, {
    useFactory: (c) => new CreateUserUseCase(
      c.resolve(TOKENS.UserRepository),
      c.resolve(TOKENS.Logger)
    ),
  });
  return container;
}

// Handler'da kullanım
const useCase = container.resolve<CreateUserUseCase>(TOKENS.CreateUserUseCase);
```

### Observability Ekleme

```typescript
// .env'de aktifleştir
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
SENTRY_DSN=https://xxx@sentry.io/xxx

// Manuel tracing
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service');
const span = tracer.startSpan('operation-name');
try {
  // ... operasyon
} finally {
  span.end();
}

// Manuel hata yakalama
import { captureException } from './infra/monitoring/sentry.js';
captureException(error, { userId: '123' });
```

## Script'ler

| Script | Açıklama |
|--------|----------|
| `npm run dev` | Hot reload ile başlat |
| `npm run build` | TypeScript derle |
| `npm start` | Production başlat |
| `npm test` | Test çalıştır |
| `npm run lint` | Kod stili kontrol |
| `npm run typecheck` | Tip kontrolü |

## Docker

### Build

```bash
docker build -t my-service .
```

### Çalıştır

```bash
docker-compose up -d
```

## Health Endpoint'leri

### Liveness Probe
```bash
curl http://localhost:3000/health
```

### Readiness Probe
```bash
curl http://localhost:3000/ready
```

## En İyi Pratikler

1. **Her zaman correlation ID kullan** - Servisler arası `X-Correlation-ID` header'ı geçir
2. **Tüm input'ları doğrula** - Request validation için Zod şemaları kullan
3. **Hataları düzgün yönet** - `shared/errors`'dan custom error class'ları kullan
4. **Context ile logla** - Tüm log'lara correlationId ekle
5. **Kritik yolları test et** - Use case'ler ve handler'lar için test yaz

## Dokümantasyon

- [Mimari Genel Bakış](docs/tr/ARCHITECTURE.md)
- [Genişletme Rehberi](docs/tr/guides/EXTENDING.md)
- [Design Patterns](docs/tr/guides/PATTERNS.md)

## Lisans

UNLICENSED
