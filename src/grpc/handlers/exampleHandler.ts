/**
 * gRPC Example Service Handlers
 * Implements the ExampleService defined in service.proto
 *
 * Uses the same Use Cases as HTTP endpoints - Clean Architecture in action!
 */
import * as grpc from '@grpc/grpc-js';
import { container } from '../../container.js';
import { TOKENS } from '../../container.js';
import {
  CreateExampleUseCase,
  GetExampleUseCase,
  ListExamplesUseCase,
} from '../../application/useCases/index.js';
import logger from '../../infra/logger/logger.js';

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

interface ExampleResponse {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

interface ListExamplesResponse {
  examples: ExampleResponse[];
  total: number;
}

/**
 * gRPC callback type helper
 */
type GrpcCallback<T> = (error: grpc.ServiceError | null, response?: T) => void;

/**
 * Helper to create gRPC error
 */
function createGrpcError(code: grpc.status, message: string): grpc.ServiceError {
  return {
    code,
    message,
    name: 'GrpcError',
    details: message,
    metadata: new grpc.Metadata(),
  };
}

/**
 * GetExample - Get a single example by ID
 */
async function getExample(
  call: grpc.ServerUnaryCall<GetExampleRequest, ExampleResponse>,
  callback: GrpcCallback<ExampleResponse>
): Promise<void> {
  const { id } = call.request;

  logger.debug({ id }, 'gRPC GetExample called');

  try {
    const useCase = container.resolve<GetExampleUseCase>(TOKENS.GetExampleUseCase);
    const result = await useCase.execute({ id });

    if (!result) {
      callback(createGrpcError(grpc.status.NOT_FOUND, `Example with id ${id} not found`));
      return;
    }

    callback(null, {
      id: result.id,
      name: result.name,
      created_at: result.createdAt.toISOString(),
      updated_at: result.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error({ err: error, id }, 'gRPC GetExample failed');
    callback(createGrpcError(grpc.status.INTERNAL, 'Internal server error'));
  }
}

/**
 * CreateExample - Create a new example
 */
async function createExample(
  call: grpc.ServerUnaryCall<CreateExampleRequest, ExampleResponse>,
  callback: GrpcCallback<ExampleResponse>
): Promise<void> {
  const { name } = call.request;

  logger.debug({ name }, 'gRPC CreateExample called');

  // Validation
  if (!name || name.trim().length === 0) {
    callback(createGrpcError(grpc.status.INVALID_ARGUMENT, 'Name is required'));
    return;
  }

  if (name.length > 100) {
    callback(createGrpcError(grpc.status.INVALID_ARGUMENT, 'Name too long (max 100 characters)'));
    return;
  }

  try {
    const useCase = container.resolve<CreateExampleUseCase>(TOKENS.CreateExampleUseCase);
    const result = await useCase.execute({ name });

    callback(null, {
      id: result.id,
      name: result.name,
      created_at: result.createdAt.toISOString(),
      updated_at: result.createdAt.toISOString(), // Same as created for new records
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      callback(createGrpcError(grpc.status.ALREADY_EXISTS, error.message));
      return;
    }

    logger.error({ err: error, name }, 'gRPC CreateExample failed');
    callback(createGrpcError(grpc.status.INTERNAL, 'Internal server error'));
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
    callback(createGrpcError(grpc.status.INTERNAL, 'Internal server error'));
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
