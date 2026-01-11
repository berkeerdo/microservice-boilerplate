import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';

// Mock env config to prevent process.exit
vi.mock('../../src/config/env.js', () => ({
  default: {
    NODE_ENV: 'test',
    PORT: 3000,
    GRPC_ENABLED: false,
    GRPC_PORT: 50051,
    LOG_LEVEL: 'error',
    SERVICE_NAME: 'test-service',
    SERVICE_VERSION: '1.0.0',
    CORS_ORIGINS: '',
    RATE_LIMIT_MAX: 100,
    RATE_LIMIT_WINDOW_MS: 60000,
    DB_HOST: 'localhost',
    DB_PORT: 3306,
    DB_USERNAME: 'test',
    DB_PASSWORD: 'test',
    DB_NAME: 'test_db',
    DB_CONNECTION_LIMIT: 10,
    DB_QUEUE_LIMIT: 100,
    DB_CONNECT_TIMEOUT: 10000,
    DB_QUERY_TIMEOUT: 30000,
    DB_MULTIPLE_STATEMENTS: true,
    REDIS_ENABLED: false,
    REDIS_SERVER: 'localhost',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: '',
    REDIS_VHOST: 'cache',
    CORE_AUTO_FEATURES: false,
    RABBITMQ_ENABLED: false,
    OTEL_ENABLED: false,
  },
}));

// Mock Sentry to prevent env import issues
vi.mock('../../src/infra/monitoring/sentry.js', () => ({
  initSentry: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { createServer } from '../../src/app/server.js';
import { registerDependencies, container, TOKENS } from '../../src/container.js';
import { InMemoryExampleRepository } from '../../src/infra/db/repositories/ExampleRepository.js';

describe('Example API Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Initialize DI container
    registerDependencies();

    // Create server
    app = await createServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Clear in-memory repository before each test
    const repo = container.resolve<InMemoryExampleRepository>(TOKENS.ExampleRepository);
    repo.clear();
  });

  describe('GET /api/v1/examples', () => {
    it('should return empty list initially', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/examples',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should return list of examples', async () => {
      // Create some examples first
      await app.inject({
        method: 'POST',
        url: '/api/v1/examples',
        payload: { name: 'Example 1' },
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/examples',
        payload: { name: 'Example 2' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/examples',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.items).toHaveLength(2);
      expect(body.items[0].name).toBe('Example 1');
      expect(body.items[1].name).toBe('Example 2');
    });

    it('should support pagination', async () => {
      // Create 3 examples
      for (let i = 1; i <= 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/v1/examples',
          payload: { name: `Example ${i}` },
        });
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/examples?limit=2&offset=1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.items).toHaveLength(2);
      expect(body.limit).toBe(2);
      expect(body.offset).toBe(1);
    });
  });

  describe('GET /api/v1/examples/:id', () => {
    it('should return 404 for non-existent example', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/examples/999',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('NOT_FOUND');
    });

    it('should return example by id', async () => {
      // Create an example
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/examples',
        payload: { name: 'Test Example' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/examples/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe(created.id);
      expect(body.name).toBe('Test Example');
    });
  });

  describe('POST /api/v1/examples', () => {
    it('should create a new example', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/examples',
        payload: { name: 'New Example' },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('New Example');
      expect(body.createdAt).toBeDefined();
    });

    it('should return 400 for duplicate name', async () => {
      // Create first example
      await app.inject({
        method: 'POST',
        url: '/api/v1/examples',
        payload: { name: 'Duplicate' },
      });

      // Try to create duplicate
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/examples',
        payload: { name: 'Duplicate' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('DUPLICATE');
    });

    it('should return 400 for empty name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/examples',
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /api/v1/examples/:id', () => {
    it('should update an existing example', async () => {
      // Create an example
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/examples',
        payload: { name: 'Original' },
      });
      const created = JSON.parse(createResponse.payload);

      // Update it
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/examples/${created.id}`,
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.name).toBe('Updated');
    });

    it('should return 404 for non-existent example', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/examples/999',
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/examples/:id', () => {
    it('should delete an existing example', async () => {
      // Create an example
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/examples',
        payload: { name: 'To Delete' },
      });
      const created = JSON.parse(createResponse.payload);

      // Delete it
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/examples/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);

      // Verify it's deleted
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/examples/${created.id}`,
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it('should return 404 for non-existent example', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/examples/999',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Health Endpoints', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(['ok', 'healthy', 'degraded']).toContain(body.status);
    });

    it('should return readiness status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      // In test environment without actual DB, readiness may return 503
      expect([200, 503]).toContain(response.statusCode);
      const body = JSON.parse(response.payload);
      expect(typeof body.ready).toBe('boolean');
    });
  });
});
