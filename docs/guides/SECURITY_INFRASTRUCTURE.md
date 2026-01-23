# LobsterLead Security Infrastructure Guide

**Date:** 2025-12-09
**Version:** 1.0
**Status:** Production Ready

This document explains the security infrastructure in LobsterLead microservice architecture and how to apply it to other services.

---

## Architecture Overview

```
                    Internet
                        |
                        v
            +-------------------+
            |    API Gateway    |  <- Helmet, HSTS, CSP, Rate Limiting
            | (lobsterlead-gw)  |  <- trustProxy: true (real IP)
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

## Service-Based Security Requirements

### Gateway (Public-Facing)
| Feature | Status | Description |
|---------|--------|-------------|
| Helmet.js | REQUIRED | Security headers |
| HSTS | REQUIRED | HTTPS enforcement |
| CSP | REQUIRED | Content Security Policy |
| CORS | REQUIRED | Origin whitelist |
| Rate Limiting | REQUIRED | Redis-backed |
| trustProxy | REQUIRED | Real client IP |
| security.txt | REQUIRED | RFC 9116 |

### Backend Services (Internal)
| Feature | Status | Description |
|---------|--------|-------------|
| PII Log Redaction | REQUIRED | All services |
| Error Sanitization | REQUIRED | Hide stack traces |
| gRPC Auth | REQUIRED | Token validation |
| SQL Injection Prevention | REQUIRED | Parameterized queries |
| Input Validation | REQUIRED | Zod schemas |

---

## 1. Logger PII Redaction

Every service must use the following REDACT_PATHS in `src/infra/logger/logger.ts`:

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
  // ... other settings
});
```

**File to copy:** `lobsterlead-auth-service/src/infra/logger/logger.ts`

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
  // isOperational = true -> show message
  // isOperational = false -> generic message
  const isOperational = error instanceof AppError && error.isOperational;

  const response = {
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: isOperational ? error.message : 'An unexpected error occurred',
      // Stack trace ONLY in development
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
        : 'An unexpected error occurred. Please try again.',
      // Stack trace NEVER in production
      ...(isProduction ? {} : { details: String(error) }),
    },
  } as T;
}
```

**Files to copy:**
- `lobsterlead-auth-service/src/shared/errors/AppError.ts`
- `lobsterlead-auth-service/src/shared/errors/errorHandler.ts`
- `lobsterlead-auth-service/src/shared/errors/grpcErrorHandler.ts`
- `lobsterlead-auth-service/src/shared/errors/errorSanitizer.ts`

---

## 3. Environment Validation

Every service must enforce minimum length for JWT secrets:

```typescript
// src/config/env.schema.ts
import { z } from 'zod';

export const envSchema = z.object({
  // JWT (OWASP: minimum 256-bit = 64 hex characters for HS256)
  JWT_SECRET: z.string().min(64, 'JWT_SECRET must be at least 64 characters (256-bit) for security'),
  JWT_REFRESH_SECRET: z.string().min(64, 'JWT_REFRESH_SECRET must be at least 64 characters (256-bit) for security'),

  // Other env vars...
});
```

---

## 4. IP Forwarding (Gateway -> Services)

### 4.1 Gateway Configuration

```typescript
// gateway/src/app/server.ts
const fastify = Fastify({
  trustProxy: true,  // Get real IP from X-Forwarded-For header
  // ...
});
```

### 4.2 Sending IP in gRPC Request

```typescript
// gateway/src/app/routes/authRoutes.ts
const result = await authClient.SignIn({
  email,
  password,
  remember_me: rememberMe,
  ip_address: request.ip,  // Real client IP
});
```

### 4.3 Using IP in Service

```typescript
// auth-service/src/grpc/handlers/auth/authHandler.ts
async function signIn(call, callback) {
  const { email, password, remember_me, ip_address } = call.request;

  const result = await useCase.execute({
    email,
    password,
    rememberMe: remember_me,
    ip: ip_address,  // Use for rate limiting
  });
}
```

---

## 5. Rate Limiting Strategy

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
const LOCKOUT_DURATION = 15 * 60;    // 15 minutes
const IP_LOCKOUT_DURATION = 30 * 60; // 30 minutes
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

## 7. Service Migration Checklist

For each new service:

```markdown
## [Service Name] Security Checklist

### Logger
- [ ] PII redaction paths added
- [ ] Pino structured logging active

### Error Handling
- [ ] AppError classes copied
- [ ] errorHandler.ts copied
- [ ] grpcErrorHandler.ts copied
- [ ] Stack trace hidden in production

### Environment
- [ ] JWT_SECRET minimum 64 characters
- [ ] Sensitive env vars validated

### gRPC
- [ ] IP forwarding implemented
- [ ] Token validation active

### Database
- [ ] Parameterized queries used
- [ ] db-bridge query builder used (prevents SQL injection)

### Input Validation
- [ ] Zod schemas defined
- [ ] Request validation active
```

---

## 8. File Structure

Required security files in every backend service:

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

## 9. Test Scenarios

### 9.1 PII Redaction Test
```bash
# Email/password should not appear in logs
curl -X POST /auth/signin -d '{"email":"test@test.com","password":"secret123"}'
# Log: {"email":"[REDACTED]","password":"[REDACTED]"}
```

### 9.2 Error Sanitization Test
```bash
# Stack trace should not appear in production
NODE_ENV=production npm start
# Error response: {"error":{"message":"An unexpected error occurred"}}
# (No stack trace)
```

### 9.3 Rate Limiting Test
```bash
# Lockout after 5 failed logins
for i in {1..6}; do
  curl -X POST /auth/signin -d '{"email":"test@test.com","password":"wrong"}'
done
# 6th request: 429 Too Many Requests
```

---

## 10. References

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [OWASP Node.js Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html)
- [Fastify Security Best Practices](https://fastify.dev/docs/latest/Reference/Recommendations/)
- [Pino Redaction](https://getpino.io/#/docs/redaction)
- [Helmet.js Documentation](https://helmetjs.github.io/)

---

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2025-12-09 | 1.0 | Initial release |
