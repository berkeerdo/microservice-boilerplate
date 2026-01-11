# Genişletme Rehberi

Bu boilerplate'i yeni servis oluştururken nasıl genişleteceğinizi açıklar.

## Yeni Endpoint Ekleme

### 1. Route Dosyası Oluştur

```typescript
// src/app/routes/userRoutes.ts
import { FastifyInstance } from 'fastify';
import { container } from '../../container.js';
import { CreateUserUseCase, GetUserUseCase } from '../../application/useCases/index.js';
import { createZodValidator } from '../middlewares/index.js';
import { z } from 'zod';

// Request şemaları
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  role: z.enum(['admin', 'user']).optional(),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /users/:id
  fastify.get('/:id', {
    schema: {
      tags: ['Users'],
      summary: 'ID ile kullanıcı getir',
      params: { type: 'object', properties: { id: { type: 'integer' } } },
    },
    preHandler: createZodValidator(idParamSchema),
    handler: async (request) => {
      const { id } = request.params as { id: number };
      const useCase = container.resolve<GetUserUseCase>('GetUserUseCase');
      return useCase.execute({ id });
    },
  });

  // POST /users (korumalı)
  fastify.post('/', {
    schema: {
      tags: ['Users'],
      summary: 'Yeni kullanıcı oluştur',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [
      fastify.authenticate,
      createZodValidator(createUserSchema),
    ],
    handler: async (request) => {
      const useCase = container.resolve<CreateUserUseCase>('CreateUserUseCase');
      return useCase.execute(request.body as z.infer<typeof createUserSchema>);
    },
  });
}
```

### 2. Route'u Register Et

```typescript
// src/app/routes/index.ts
import { userRoutes } from './userRoutes.js';

export function registerRoutes(fastify: FastifyInstance): void {
  // ... mevcut route'lar

  // API Routes
  fastify.register(userRoutes, { prefix: '/api/v1/users' });
}
```

---

## Yeni Use Case Ekleme

### 1. Use Case Oluştur

```typescript
// src/application/useCases/CreateUserUseCase.ts
import { BaseUseCase } from './BaseUseCase.js';
import { Logger } from '../../infra/logger/logger.js';
import { User } from '../../domain/models/User.js';

interface CreateUserInput {
  email: string;
  name: string;
  role?: string;
}

export class CreateUserUseCase extends BaseUseCase<CreateUserInput, User> {
  constructor(
    private readonly userRepository: IUserRepository,
    logger: Logger
  ) {
    super(logger);
  }

  async execute(input: CreateUserInput): Promise<User> {
    this.logStart('CreateUserUseCase', { email: input.email });

    // İş mantığı
    const existingUser = await this.userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictError('Kullanıcı zaten mevcut');
    }

    const user = await this.userRepository.create({
      email: input.email,
      name: input.name,
      role: input.role || 'user',
    });

    this.logSuccess('CreateUserUseCase', { userId: user.id });
    return user;
  }
}
```

### 2. Container'a Register Et

```typescript
// src/container.ts
import { CreateUserUseCase } from './application/useCases/CreateUserUseCase.js';

export const TOKENS = {
  // ... mevcut token'lar
  UserRepository: 'UserRepository',
  CreateUserUseCase: 'CreateUserUseCase',
};

export function registerDependencies(): DependencyContainer {
  // Repository
  container.registerSingleton(TOKENS.UserRepository, UserRepository);

  // Use Case
  container.register(TOKENS.CreateUserUseCase, {
    useFactory: (c) => new CreateUserUseCase(
      c.resolve(TOKENS.UserRepository),
      c.resolve(TOKENS.Logger)
    ),
  });

  return container;
}
```

---

## Yeni Repository Ekleme

### 1. Repository Oluştur

```typescript
// src/infra/db/repositories/UserRepository.ts
import { BaseRepository, IRepository } from './BaseRepository.js';
import { User } from '../../../domain/models/User.js';

export interface IUserRepository extends IRepository<User> {
  findByEmail(email: string): Promise<User | null>;
}

export class UserRepository extends BaseRepository<User> implements IUserRepository {
  constructor() {
    super('users', 'user'); // tableName, cachePrefix
  }

  async findByEmail(email: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE email = ? LIMIT 1';
    const results = await this.query<User>(sql, [email]);
    return results[0] || null;
  }

  async create(entity: Partial<User>): Promise<number> {
    const sql = 'INSERT INTO users (email, name, role) VALUES (?, ?, ?)';
    const result = await this.execute(sql, [
      entity.email,
      entity.name,
      entity.role || 'user',
    ]);
    return result.insertId;
  }

  async update(id: number, entity: Partial<User>): Promise<boolean> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (entity.name) {
      fields.push('name = ?');
      values.push(entity.name);
    }
    if (entity.role) {
      fields.push('role = ?');
      values.push(entity.role);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    const result = await this.execute(sql, values);
    return result.affectedRows > 0;
  }

  // Büyük veri setleri için cursor-based pagination
  async findAllWithCursor(limit: number, cursor?: string): Promise<CursorPaginationResult<User>> {
    return this.findAllCursor(limit, cursor, 'ASC');
  }
}
```

### Cursor Pagination Kullanımı

Büyük veri setleri için offset yerine cursor-based pagination tercih edin:

```typescript
// Use case veya route handler içinde
const result = await userRepository.findAllCursor(100, lastCursor);

// Yanıt formatı:
// {
//   data: User[],      // Maksimum 100 kullanıcı
//   hasMore: boolean,  // Daha fazla sayfa varsa true
//   nextCursor: "123"  // Sonraki sayfa için bu değeri geçin
// }

// Frontend kullanımı:
// İlk sayfa: GET /users?limit=100
// Sonraki:   GET /users?limit=100&cursor=123
```

---

## Yeni Domain Model Ekleme

```typescript
// src/domain/models/User.ts
export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

// Value Objects
export interface Email {
  value: string;
}

export function createEmail(value: string): Email {
  if (!value.includes('@')) {
    throw new Error('Geçersiz email formatı');
  }
  return { value: value.toLowerCase() };
}
```

---

## Yeni Provider Ekleme

Provider'lar external servislerle iletişim için kullanılır:

```typescript
// src/application/providers/EmailProvider.ts
import logger from '../../infra/logger/logger.js';

export interface IEmailProvider {
  sendWelcome(email: string, name: string): Promise<void>;
  sendPasswordReset(email: string, token: string): Promise<void>;
}

export class SendGridEmailProvider implements IEmailProvider {
  constructor(private readonly apiKey: string) {}

  async sendWelcome(email: string, name: string): Promise<void> {
    logger.info({ email }, 'Hoşgeldin emaili gönderiliyor');
    // SendGrid API çağrısı
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    logger.info({ email }, 'Şifre sıfırlama emaili gönderiliyor');
    // SendGrid API çağrısı
  }
}

// Test için mock
export class MockEmailProvider implements IEmailProvider {
  public sentEmails: Array<{ type: string; email: string }> = [];

  async sendWelcome(email: string): Promise<void> {
    this.sentEmails.push({ type: 'welcome', email });
  }

  async sendPasswordReset(email: string): Promise<void> {
    this.sentEmails.push({ type: 'password_reset', email });
  }
}
```

---

## Yeni Middleware Ekleme

```typescript
// src/app/middlewares/requestLogger.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function registerRequestLogger(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    request.log.info({
      method: request.method,
      url: request.url,
      correlationId: request.headers['x-correlation-id'],
    }, 'Gelen istek');
  });

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    }, 'İstek tamamlandı');
  });
}
```

---

## Migration Ekleme

```bash
npm run migrate:make create_users_table
```

```typescript
// src/infra/db/migrations/20240101000000_create_users_table.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('email', 255).notNullable().unique();
    table.string('name', 100).notNullable();
    table.enum('role', ['admin', 'user', 'moderator']).defaultTo('user');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('email');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('users');
}
```

---

## Test Ekleme

```typescript
// tests/unit/useCases/CreateUserUseCase.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateUserUseCase } from '../../../src/application/useCases/CreateUserUseCase.js';

describe('CreateUserUseCase', () => {
  let useCase: CreateUserUseCase;
  let mockUserRepo: any;
  let mockLogger: any;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: vi.fn(),
      create: vi.fn(),
    };
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    useCase = new CreateUserUseCase(mockUserRepo, mockLogger);
  });

  it('yeni kullanıcı oluşturmalı', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.create.mockResolvedValue({ id: 1, email: 'test@test.com', name: 'Test' });

    const result = await useCase.execute({
      email: 'test@test.com',
      name: 'Test',
    });

    expect(result.id).toBe(1);
    expect(mockUserRepo.create).toHaveBeenCalled();
  });

  it('kullanıcı varsa hata fırlatmalı', async () => {
    mockUserRepo.findByEmail.mockResolvedValue({ id: 1 });

    await expect(useCase.execute({
      email: 'existing@test.com',
      name: 'Test',
    })).rejects.toThrow('Kullanıcı zaten mevcut');
  });
});
```

---

## Kontrol Listesi: Yeni Feature Eklerken

- [ ] Domain model oluşturuldu (`domain/models/`)
- [ ] Repository oluşturuldu (`infra/db/repositories/`)
- [ ] Use Case oluşturuldu (`application/useCases/`)
- [ ] DI container'a register edildi (`container.ts`)
- [ ] Route oluşturuldu (`app/routes/`)
- [ ] Route register edildi (`app/routes/index.ts`)
- [ ] Migration oluşturuldu (`infra/db/migrations/`)
- [ ] Unit test yazıldı (`tests/unit/`)
- [ ] Swagger şema eklendi
