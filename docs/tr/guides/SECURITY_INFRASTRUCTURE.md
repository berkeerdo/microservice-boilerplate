# LobsterLead Security Infrastructure Guide

**Tarih:** 2025-12-09
**Versiyon:** 1.0
**Durum:** Production Ready

Bu dokuman LobsterLead mikroservis mimarisindeki guvenlik altyapisini ve diger servislere nasil uygulanacagini aciklar.

---

## Mimari Ozet

```
                    Internet
                        |
                        v
            +-------------------+
            |    API Gateway    |  <- Helmet, HSTS, CSP, Rate Limiting
            | (lobsterlead-gw)  |  <- trustProxy: true (gercek IP)
            +-------------------+
                        |
          +-------------+-------------+
          |             |             |
          v             v             v
    +---------+   +---------+   +---------+
    |  Auth   |   | Settings|   | Keywords|   <- gRPC internal
    | Service |   | Service |   | Service |   <- PII log redaction
    +---------+   +---------+   +---------+   <- Error sanitization
          |             |             |
          v             v             v
    +---------+   +---------+   +---------+
    |  MySQL  |   |  MySQL  |   |  MySQL  |
    +---------+   +---------+   +---------+
          |             |             |
          +-------------+-------------+
                        |
                        v
                  +---------+
                  |  Redis  |  <- Session, Rate Limit, Cache
                  +---------+
```

---

## Servis Bazli Guvenlik Gereksinimleri

### Gateway (Public-Facing)
| Ozellik | Durum | Aciklama |
|---------|-------|----------|
| Helmet.js | REQUIRED | Security headers |
| HSTS | REQUIRED | HTTPS zorunlulugu |
| CSP | REQUIRED | Content Security Policy |
| CORS | REQUIRED | Origin whitelist |
| Rate Limiting | REQUIRED | Redis-backed |
| trustProxy | REQUIRED | Gercek client IP |
| security.txt | REQUIRED | RFC 9116 |

### Backend Services (Internal)
| Ozellik | Durum | Aciklama |
|---------|-------|----------|
| PII Log Redaction | REQUIRED | Tum servislerde |
| Error Sanitization | REQUIRED | Stack trace gizleme |
| gRPC Auth | REQUIRED | Token validation |
| SQL Injection Prevention | REQUIRED | Parameterized queries |
| Input Validation | REQUIRED | Zod schemas |

---

## 1. Logger PII Redaction

Her serviste `src/infra/logger/logger.ts` dosyasinda asagidaki REDACT_PATHS kullanilmalidir:

```typescript
const REDACT_PATHS = [
  // Authentication
  'password', 'newPassword', 'oldPassword', 'currentPassword',
  'token', 'accessToken', 'refreshToken', 'apiKey', 'secret',
  'authorization', 'jti', 'resetToken', 'verificationToken',

  // PII (Personally Identifiable Information)
  'email', 'phone', 'phoneNumber', 'mobileNumber', 'address',
  'dateOfBirth', 'dob', 'socialSecurityNumber', 'nationalId', 'passportNumber',

  // Request headers
  'req.headers.authorization', 'req.headers.cookie',
  'req.headers["x-api-key"]', 'req.headers["x-forwarded-for"]',

  // Body fields
  'body.password', 'body.email', 'body.token', 'body.creditCard',
  'body.cardNumber', 'body.cvv', 'body.ssn', 'body.phone',

  // OAuth
  'oauthToken', 'oauthSecret', 'accessTokenSecret', 'code', 'state',

  // Database
  'connectionString', 'DB_PASSWORD', 'REDIS_PASSWORD',
  'JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY',
];

const logger = pino({
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  // ... diger ayarlar
});
```

**Kopyalanacak dosya:** `lobsterlead-auth-service/src/infra/logger/logger.ts`

---

## 2. Error Handling & Sanitization

### 2.1 AppError Classes

```typescript
// src/shared/errors/AppError.ts
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;

  constructor(message: string, statusCode: number, isOperational = true, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, true, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, true, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, 401, true, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403, true, 'FORBIDDEN');
  }
}
```

### 2.2 Error Handler (HTTP)

```typescript
// src/shared/errors/errorHandler.ts
import config from '../../config/env.js';

const isProduction = config.NODE_ENV === 'production';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  // isOperational = true -> mesaji goster
  // isOperational = false -> generic mesaj
  const isOperational = error instanceof AppError && error.isOperational;

  const response = {
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: isOperational ? error.message : 'Beklenmeyen bir hata olustu',
      // Stack trace SADECE development'ta
      ...(isProduction ? {} : { stack: error.stack }),
    },
  };

  reply.status(error.statusCode || 500).send(response);
}
```

### 2.3 gRPC Error Handler

```typescript
// src/shared/errors/grpcErrorHandler.ts
import config from '../../config/env.js';

const isProduction = config.NODE_ENV === 'production';

export function createGrpcErrorResponse<T>(error: unknown, fallbackCode: string): T {
  const isOperational = error instanceof AppError && error.isOperational;

  return {
    success: false,
    error: {
      code: (error instanceof AppError ? error.code : fallbackCode) || fallbackCode,
      message: isOperational
        ? (error as AppError).message
        : 'Beklenmeyen bir hata olustu. Lutfen tekrar deneyin.',
      // Stack trace ASLA production'da
      ...(isProduction ? {} : { details: String(error) }),
    },
  } as T;
}
```

**Kopyalanacak dosyalar:**
- `lobsterlead-auth-service/src/shared/errors/AppError.ts`
- `lobsterlead-auth-service/src/shared/errors/errorHandler.ts`
- `lobsterlead-auth-service/src/shared/errors/grpcErrorHandler.ts`
- `lobsterlead-auth-service/src/shared/errors/errorSanitizer.ts`

---

## 3. Environment Validation

Her serviste JWT secret'lar icin minimum uzunluk zorunlulugu:

```typescript
// src/config/env.schema.ts
import { z } from 'zod';

export const envSchema = z.object({
  // JWT (OWASP: minimum 256-bit = 64 hex characters for HS256)
  JWT_SECRET: z.string().min(64, 'JWT_SECRET must be at least 64 characters (256-bit) for security'),
  JWT_REFRESH_SECRET: z.string().min(64, 'JWT_REFRESH_SECRET must be at least 64 characters (256-bit) for security'),

  // Diger env vars...
});
```

---

## 4. IP Forwarding (Gateway -> Services)

### 4.1 Gateway Ayari

```typescript
// gateway/src/app/server.ts
const fastify = Fastify({
  trustProxy: true,  // X-Forwarded-For header'dan gercek IP al
  // ...
});
```

### 4.2 gRPC Request'te IP Gonderme

```typescript
// gateway/src/app/routes/authRoutes.ts
const result = await authClient.SignIn({
  email,
  password,
  remember_me: rememberMe,
  ip_address: request.ip,  // Gercek client IP
});
```

### 4.3 Service Tarafinda IP Kullanimi

```typescript
// auth-service/src/grpc/handlers/auth/authHandler.ts
async function signIn(call, callback) {
  const { email, password, remember_me, ip_address } = call.request;

  const result = await useCase.execute({
    email,
    password,
    rememberMe: remember_me,
    ip: ip_address,  // Rate limiting icin kullan
  });
}
```

---

## 5. Rate Limiting Stratejisi

### 5.1 Gateway Level (Global)

```typescript
// gateway/src/app/plugins/rateLimit.ts
await fastify.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis: redisClient,
  keyGenerator: (request) => request.ip,
});
```

### 5.2 Auth Service Level (Brute Force)

```typescript
// auth-service/src/infra/security/loginAttemptService.ts
const MAX_ATTEMPTS = 5;              // Per email
const MAX_IP_ATTEMPTS = 20;          // Per IP (distributed attacks)
const LOCKOUT_DURATION = 15 * 60;    // 15 dakika
const IP_LOCKOUT_DURATION = 30 * 60; // 30 dakika
```

---

## 6. Security Headers (Gateway Only)

```typescript
// gateway/src/app/server.ts
await fastify.register(helmet, {
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
```

---

## 7. Servis Migration Checklist

Her yeni servis icin:

```markdown
## [Service Name] Security Checklist

### Logger
- [ ] PII redaction paths eklendi
- [ ] Pino structured logging aktif

### Error Handling
- [ ] AppError classes kopyalandi
- [ ] errorHandler.ts kopyalandi
- [ ] grpcErrorHandler.ts kopyalandi
- [ ] Production'da stack trace gizli

### Environment
- [ ] JWT_SECRET minimum 64 karakter
- [ ] Sensitive env vars validated

### gRPC
- [ ] IP forwarding implement edildi
- [ ] Token validation aktif

### Database
- [ ] Parameterized queries kullaniliyor
- [ ] Knex query builder kullaniliyor

### Input Validation
- [ ] Zod schemas tanimli
- [ ] Request validation aktif
```

---

## 8. Dosya Yapisi

Her backend serviste olmasi gereken guvenlik dosyalari:

```
src/
├── shared/
│   └── errors/
│       ├── AppError.ts          # Error classes
│       ├── errorHandler.ts      # HTTP error middleware
│       ├── grpcErrorHandler.ts  # gRPC error responses
│       ├── errorSanitizer.ts    # Message sanitization
│       └── index.ts             # Exports
├── infra/
│   ├── logger/
│   │   └── logger.ts            # PII redaction
│   └── security/                # (Auth service only)
│       └── loginAttemptService.ts
└── config/
    └── env.schema.ts            # JWT secret validation
```

---

## 9. Test Senaryolari

### 9.1 PII Redaction Test
```bash
# Log'larda email/password gorunmemeli
curl -X POST /auth/signin -d '{"email":"test@test.com","password":"secret123"}'
# Log: {"email":"[REDACTED]","password":"[REDACTED]"}
```

### 9.2 Error Sanitization Test
```bash
# Production'da stack trace gorunmemeli
NODE_ENV=production npm start
# Error response: {"error":{"message":"Beklenmeyen bir hata olustu"}}
# (No stack trace)
```

### 9.3 Rate Limiting Test
```bash
# 5 basarisiz login sonrasi lockout
for i in {1..6}; do
  curl -X POST /auth/signin -d '{"email":"test@test.com","password":"wrong"}'
done
# 6. request: 429 Too Many Requests
```

---

## 10. Referanslar

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [OWASP Node.js Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html)
- [Fastify Security Best Practices](https://fastify.dev/docs/latest/Reference/Recommendations/)
- [Pino Redaction](https://getpino.io/#/docs/redaction)
- [Helmet.js Documentation](https://helmetjs.github.io/)

---

## Changelog

| Tarih | Versiyon | Degisiklik |
|-------|----------|------------|
| 2025-12-09 | 1.0 | Initial release |
