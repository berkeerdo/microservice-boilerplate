import { beforeAll, afterAll, vi } from 'vitest';

// Set test environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.SERVICE_NAME = 'test-service';
process.env.SERVICE_VERSION = '1.0.0';

// Database (required but not used with InMemoryRepository)
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USERNAME = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test_db';

// Redis (disabled for tests)
process.env.REDIS_ENABLED = 'false';
process.env.REDIS_SERVER = 'localhost';
process.env.REDIS_PORT = '6379';

// Disable observability for tests
process.env.OTEL_ENABLED = 'false';

// Mock external dependencies if needed
beforeAll(() => {
  // Setup before all tests
});

afterAll(() => {
  // Cleanup after all tests
  vi.restoreAllMocks();
});
