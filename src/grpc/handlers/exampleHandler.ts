/**
 * gRPC Example Service Handlers
 * Implements the ExampleService defined in service.proto
 *
 * Uses the same Use Cases as HTTP endpoints - Clean Architecture in action!
 */
import type * as grpc from '@grpc/grpc-js';
import { container } from '../../container.js';
import { TOKENS } from '../../container.js';
import type {
  CreateExampleUseCase,
  GetExampleUseCase,
  ListExamplesUseCase,
} from '../../application/useCases/index.js';
import logger from '../../infra/logger/logger.js';
import {
  createGrpcErrorResponse,
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../../shared/errors/index.js';

/**
 * Type definitions matching the proto file
 */
interface GetExampleRequest {
  id: number;
}

interface CreateExampleRequest {
  name: string;
}

interface ListExamplesRequest {
  limit: number;
  offset: number;
}

interface ExampleData {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

interface GetExampleResponse {
  success: boolean;
  message?: string;
  example?: ExampleData;
  error?: string;
  status_code?: number;
}

interface CreateExampleResponse {
  success: boolean;
  message?: string;
  example?: ExampleData;
  error?: string;
  status_code?: number;
}

interface ListExamplesResponse {
  success: boolean;
  message?: string;
  examples?: ExampleData[];
  total?: number;
  error?: string;
  status_code?: number;
}

/**
 * gRPC callback type helper
 */
type GrpcCallback<T> = (error: grpc.ServiceError | null, response?: T) => void;

/**
 * GetExample - Get a single example by ID
 */
async function getExample(
  call: grpc.ServerUnaryCall<GetExampleRequest, GetExampleResponse>,
  callback: GrpcCallback<GetExampleResponse>
): Promise<void> {
  const { id } = call.request;

  logger.debug({ id }, 'gRPC GetExample called');

  try {
    const useCase = container.resolve<GetExampleUseCase>(TOKENS.GetExampleUseCase);
    const result = await useCase.execute({ id });

    if (!result) {
      callback(
        null,
        createGrpcErrorResponse(new NotFoundError('example.notFound'), 'example.getFailed')
      );
      return;
    }

    callback(null, {
      success: true,
      example: {
        id: result.id,
        name: result.name,
        created_at: result.createdAt.toISOString(),
        updated_at: result.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error, id }, 'gRPC GetExample failed');
    callback(null, createGrpcErrorResponse(error, 'example.getFailed'));
  }
}

/**
 * CreateExample - Create a new example
 */
async function createExample(
  call: grpc.ServerUnaryCall<CreateExampleRequest, CreateExampleResponse>,
  callback: GrpcCallback<CreateExampleResponse>
): Promise<void> {
  const { name } = call.request;

  logger.debug({ name }, 'gRPC CreateExample called');

  // Validation
  if (!name || name.trim().length === 0) {
    callback(
      null,
      createGrpcErrorResponse(new ValidationError('example.nameRequired'), 'example.createFailed')
    );
    return;
  }

  if (name.length > 100) {
    callback(
      null,
      createGrpcErrorResponse(new ValidationError('example.nameTooLong'), 'example.createFailed')
    );
    return;
  }

  try {
    const useCase = container.resolve<CreateExampleUseCase>(TOKENS.CreateExampleUseCase);
    const result = await useCase.execute({ name });

    callback(null, {
      success: true,
      message: 'Example created successfully',
      example: {
        id: result.id,
        name: result.name,
        created_at: result.createdAt.toISOString(),
        updated_at: result.createdAt.toISOString(), // Same as created for new records
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      callback(
        null,
        createGrpcErrorResponse(new ConflictError('example.alreadyExists'), 'example.createFailed')
      );
      return;
    }

    logger.error({ err: error, name }, 'gRPC CreateExample failed');
    callback(null, createGrpcErrorResponse(error, 'example.createFailed'));
  }
}

/**
 * ListExamples - List examples with pagination
 */
async function listExamples(
  call: grpc.ServerUnaryCall<ListExamplesRequest, ListExamplesResponse>,
  callback: GrpcCallback<ListExamplesResponse>
): Promise<void> {
  const { limit, offset } = call.request;

  logger.debug({ limit, offset }, 'gRPC ListExamples called');

  try {
    const useCase = container.resolve<ListExamplesUseCase>(TOKENS.ListExamplesUseCase);
    const result = await useCase.execute({
      limit: limit || 20,
      offset: offset || 0,
    });

    callback(null, {
      success: true,
      examples: result.items.map((item) => ({
        id: item.id,
        name: item.name,
        created_at: item.createdAt.toISOString(),
        updated_at: item.updatedAt.toISOString(),
      })),
      total: result.total,
    });
  } catch (error) {
    logger.error({ err: error }, 'gRPC ListExamples failed');
    callback(null, createGrpcErrorResponse(error, 'example.listFailed'));
  }
}

/**
 * Export handlers matching the proto service definition
 */
export const exampleServiceHandlers = {
  GetExample: getExample,
  CreateExample: createExample,
  ListExamples: listExamples,
};
