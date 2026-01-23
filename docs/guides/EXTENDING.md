# Extending Guide

How to extend this boilerplate when creating a new service.

## Adding a New Endpoint

### 1. Create Route File

```typescript
// src/app/routes/userRoutes.ts
import { FastifyInstance } from 'fastify';
import { container } from '../../container.js';
import { CreateUserUseCase, GetUserUseCase } from '../../application/useCases/index.js';
import { createZodValidator } from '../middlewares/index.js';
import { z } from 'zod';

// Request schemas
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
      summary: 'Get user by ID',
      params: { type: 'object', properties: { id: { type: 'integer' } } },
    },
    preHandler: createZodValidator(idParamSchema),
    handler: async (request) => {
      const { id } = request.params as { id: number };
      const useCase = container.resolve<GetUserUseCase>('GetUserUseCase');
      return useCase.execute({ id });
    },
  });

  // POST /users (protected)
  fastify.post('/', {
    schema: {
      tags: ['Users'],
      summary: 'Create new user',
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

### 2. Register Route

```typescript
// src/app/routes/index.ts
import { userRoutes } from './userRoutes.js';

export function registerRoutes(fastify: FastifyInstance): void {
  // ... existing routes

  // API Routes
  fastify.register(userRoutes, { prefix: '/api/v1/users' });
}
```

---

## Adding a New Use Case

### 1. Create Use Case

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

    // Business logic
    const existingUser = await this.userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictError('User already exists');
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

### 2. Register in Container

```typescript
// src/container.ts
import { CreateUserUseCase } from './application/useCases/CreateUserUseCase.js';

export const TOKENS = {
  // ... existing tokens
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

## Adding a New Repository

### 1. Create Repository

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

  // Cursor-based pagination for large datasets
  async findAllWithCursor(limit: number, cursor?: string): Promise<CursorPaginationResult<User>> {
    return this.findAllCursor(limit, cursor, 'ASC');
  }
}
```

### Using Cursor Pagination

For large datasets, prefer cursor-based pagination over offset:

```typescript
// In your use case or route handler
const result = await userRepository.findAllCursor(100, lastCursor);

// Response format:
// {
//   data: User[],      // Up to 100 users
//   hasMore: boolean,  // true if more pages exist
//   nextCursor: "123"  // Pass this for the next page
// }

// Frontend usage:
// First page: GET /users?limit=100
// Next page:  GET /users?limit=100&cursor=123
```

---

## Adding a New Domain Model

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
    throw new Error('Invalid email format');
  }
  return { value: value.toLowerCase() };
}
```

---

## Adding a New Provider

Providers are used for external service communication:

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
    logger.info({ email }, 'Sending welcome email');
    // SendGrid API call
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    logger.info({ email }, 'Sending password reset email');
    // SendGrid API call
  }
}

// Mock for testing
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

## Adding a New Middleware

```typescript
// src/app/middlewares/requestLogger.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function registerRequestLogger(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    request.log.info({
      method: request.method,
      url: request.url,
      correlationId: request.headers['x-correlation-id'],
    }, 'Incoming request');
  });

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    }, 'Request completed');
  });
}
```

---

## Adding Migration

```bash
npm run migrate:make create_users_table
```

```typescript
// src/infra/db/migrations/{prefix}_20260122120000_create_users_table.ts
import type { Migration, SchemaBuilder } from '@db-bridge/core';

const migration: Migration = {
  name: '{prefix}_20260122120000_create_users_table',

  async up(schema: SchemaBuilder): Promise<void> {
    await schema.createTable('users', (table) => {
      table.increments('id');
      table.string('email', 255).unique().notNull();
      table.string('name', 100).notNull();
      table.enum('role', ['admin', 'user', 'moderator']).default('user');
      table.timestamps();

      table.index(['email'], 'idx_users_email');
    });
  },

  async down(schema: SchemaBuilder): Promise<void> {
    await schema.dropTableIfExists('users');
  },
};

export default migration;
```

---

## Adding Tests

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

  it('should create a new user', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.create.mockResolvedValue({ id: 1, email: 'test@test.com', name: 'Test' });

    const result = await useCase.execute({
      email: 'test@test.com',
      name: 'Test',
    });

    expect(result.id).toBe(1);
    expect(mockUserRepo.create).toHaveBeenCalled();
  });

  it('should throw if user exists', async () => {
    mockUserRepo.findByEmail.mockResolvedValue({ id: 1 });

    await expect(useCase.execute({
      email: 'existing@test.com',
      name: 'Test',
    })).rejects.toThrow('User already exists');
  });
});
```

---

## Checklist: Adding New Feature

- [ ] Domain model created (`domain/models/`)
- [ ] Repository created (`infra/db/repositories/`)
- [ ] Use Case created (`application/useCases/`)
- [ ] Registered in DI container (`container.ts`)
- [ ] Route created (`app/routes/`)
- [ ] Route registered (`app/routes/index.ts`)
- [ ] Migration created (`infra/db/migrations/`)
- [ ] Unit tests written (`tests/unit/`)
- [ ] Swagger schema added
