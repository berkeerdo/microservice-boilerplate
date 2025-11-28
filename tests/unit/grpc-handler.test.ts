import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as grpc from '@grpc/grpc-js';

// Mock the container before importing handler
vi.mock('../../src/container.js', () => ({
  container: {
    resolve: vi.fn(),
  },
  TOKENS: {
    GetExampleUseCase: 'getExampleUseCase',
    CreateExampleUseCase: 'createExampleUseCase',
    ListExamplesUseCase: 'listExamplesUseCase',
  },
}));

// Mock logger
vi.mock('../../src/infra/logger/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import { exampleServiceHandlers } from '../../src/grpc/handlers/exampleHandler.js';
import { container } from '../../src/container.js';

describe('gRPC Example Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GetExample', () => {
    it('should return example when found', async () => {
      const mockResult = {
        id: 1,
        name: 'Test',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      };

      const mockUseCase = {
        execute: vi.fn().mockResolvedValue(mockResult),
      };

      vi.mocked(container.resolve).mockReturnValue(mockUseCase);

      const call = {
        request: { id: 1 },
      } as grpc.ServerUnaryCall<{ id: number }, unknown>;

      const callback = vi.fn();

      await exampleServiceHandlers.GetExample(call, callback);

      expect(callback).toHaveBeenCalledWith(null, {
        id: 1,
        name: 'Test',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      });
    });

    it('should return NOT_FOUND when example does not exist', async () => {
      const mockUseCase = {
        execute: vi.fn().mockResolvedValue(null),
      };

      vi.mocked(container.resolve).mockReturnValue(mockUseCase);

      const call = {
        request: { id: 999 },
      } as grpc.ServerUnaryCall<{ id: number }, unknown>;

      const callback = vi.fn();

      await exampleServiceHandlers.GetExample(call, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: grpc.status.NOT_FOUND,
          message: 'Example with id 999 not found',
        })
      );
    });
  });

  describe('CreateExample', () => {
    it('should create example successfully', async () => {
      const mockResult = {
        id: 1,
        name: 'New Example',
        createdAt: new Date('2025-01-01'),
      };

      const mockUseCase = {
        execute: vi.fn().mockResolvedValue(mockResult),
      };

      vi.mocked(container.resolve).mockReturnValue(mockUseCase);

      const call = {
        request: { name: 'New Example' },
      } as grpc.ServerUnaryCall<{ name: string }, unknown>;

      const callback = vi.fn();

      await exampleServiceHandlers.CreateExample(call, callback);

      expect(mockUseCase.execute).toHaveBeenCalledWith({ name: 'New Example' });
      expect(callback).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          id: 1,
          name: 'New Example',
        })
      );
    });

    it('should return INVALID_ARGUMENT for empty name', async () => {
      const call = {
        request: { name: '' },
      } as grpc.ServerUnaryCall<{ name: string }, unknown>;

      const callback = vi.fn();

      await exampleServiceHandlers.CreateExample(call, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Name is required',
        })
      );
    });

    it('should return INVALID_ARGUMENT for name too long', async () => {
      const call = {
        request: { name: 'a'.repeat(101) },
      } as grpc.ServerUnaryCall<{ name: string }, unknown>;

      const callback = vi.fn();

      await exampleServiceHandlers.CreateExample(call, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Name too long (max 100 characters)',
        })
      );
    });

    it('should return ALREADY_EXISTS for duplicate name', async () => {
      const mockUseCase = {
        execute: vi.fn().mockRejectedValue(new Error('Example with name "Test" already exists')),
      };

      vi.mocked(container.resolve).mockReturnValue(mockUseCase);

      const call = {
        request: { name: 'Test' },
      } as grpc.ServerUnaryCall<{ name: string }, unknown>;

      const callback = vi.fn();

      await exampleServiceHandlers.CreateExample(call, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: grpc.status.ALREADY_EXISTS,
        })
      );
    });
  });

  describe('ListExamples', () => {
    it('should return list of examples', async () => {
      const mockResult = {
        items: [
          {
            id: 1,
            name: 'Test 1',
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
          },
          {
            id: 2,
            name: 'Test 2',
            createdAt: new Date('2025-01-02'),
            updatedAt: new Date('2025-01-02'),
          },
        ],
        total: 2,
      };

      const mockUseCase = {
        execute: vi.fn().mockResolvedValue(mockResult),
      };

      vi.mocked(container.resolve).mockReturnValue(mockUseCase);

      const call = {
        request: { limit: 10, offset: 0 },
      } as grpc.ServerUnaryCall<{ limit: number; offset: number }, unknown>;

      const callback = vi.fn();

      await exampleServiceHandlers.ListExamples(call, callback);

      expect(callback).toHaveBeenCalledWith(null, {
        examples: expect.arrayContaining([
          expect.objectContaining({ id: 1, name: 'Test 1' }),
          expect.objectContaining({ id: 2, name: 'Test 2' }),
        ]),
        total: 2,
      });
    });

    it('should use default pagination values', async () => {
      const mockUseCase = {
        execute: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      };

      vi.mocked(container.resolve).mockReturnValue(mockUseCase);

      const call = {
        request: { limit: 0, offset: 0 },
      } as grpc.ServerUnaryCall<{ limit: number; offset: number }, unknown>;

      const callback = vi.fn();

      await exampleServiceHandlers.ListExamples(call, callback);

      expect(mockUseCase.execute).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    });
  });
});
