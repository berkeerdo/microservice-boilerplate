/**
 * Generic gRPC Handler Wrapper
 *
 * Eliminates boilerplate in gRPC handlers:
 * - Automatic try-catch with standardized error responses
 * - Automatic logging (start + error)
 * - Optional use case resolution from container
 *
 * @example
 * // Simple handler with manual use case
 * const createTeam = createGrpcHandler<CreateTeamRequest, TeamResponse>({
 *   name: 'createTeam',
 *   errorKey: 'team.createFailed',
 *   handler: async (request) => {
 *     const useCase = container.resolve<CreateTeamUseCase>(TOKENS.CreateTeamUseCase);
 *     const result = await useCase.execute({ ... });
 *     return { success: true, team: { ... } };
 *   },
 * });
 *
 * // With use case auto-resolution
 * const createTeam = createGrpcHandler<CreateTeamRequest, TeamResponse, CreateTeamUseCase>({
 *   name: 'createTeam',
 *   errorKey: 'team.createFailed',
 *   useCaseToken: TOKENS.CreateTeamUseCase,
 *   handler: async (request, useCase) => {
 *     const result = await useCase.execute({ ... });
 *     return { success: true, team: { ... } };
 *   },
 * });
 */
import type * as grpc from '@grpc/grpc-js';
import logger from '../../infra/logger/logger.js';
import { container } from '../../container.js';
import { createGrpcErrorResponse } from '../../shared/errors/index.js';
import type { GrpcCallback } from '../types/common.types.js';

// ============================================
// TYPES
// ============================================

/**
 * Handler function without use case
 */
type SimpleHandler<TRequest, TResponse> = (request: TRequest) => Promise<TResponse>;

/**
 * Handler function with use case
 */
type HandlerWithUseCase<TRequest, TResponse, TUseCase> = (
  request: TRequest,
  useCase: TUseCase
) => Promise<TResponse>;

/**
 * Options for creating a gRPC handler without use case
 */
interface SimpleHandlerOptions<TRequest, TResponse> {
  /** Handler name for logging */
  name: string;
  /** i18n error key (e.g., 'team.createFailed') */
  errorKey: string;
  /** The handler function */
  handler: SimpleHandler<TRequest, TResponse>;
}

/**
 * Options for creating a gRPC handler with use case auto-resolution
 */
interface HandlerWithUseCaseOptions<TRequest, TResponse, TUseCase> {
  /** Handler name for logging */
  name: string;
  /** i18n error key (e.g., 'team.createFailed') */
  errorKey: string;
  /** Use case token for container resolution */
  useCaseToken: string;
  /** The handler function that receives the use case */
  handler: HandlerWithUseCase<TRequest, TResponse, TUseCase>;
}

/**
 * gRPC handler function type
 */
type GrpcHandler<TRequest, TResponse> = (
  call: grpc.ServerUnaryCall<TRequest, TResponse>,
  callback: GrpcCallback<TResponse>
) => Promise<void>;

// ============================================
// HANDLER WRAPPER
// ============================================

/**
 * Create a gRPC handler with automatic error handling and logging
 *
 * @example
 * // Without use case auto-resolution
 * const getUser = createGrpcHandler({
 *   name: 'getUser',
 *   errorKey: 'user.getFailed',
 *   handler: async (request) => {
 *     // manual use case resolution if needed
 *     return { success: true, user: { ... } };
 *   },
 * });
 */
export function createGrpcHandler<TRequest, TResponse>(
  options: SimpleHandlerOptions<TRequest, TResponse>
): GrpcHandler<TRequest, TResponse>;

/**
 * Create a gRPC handler with use case auto-resolution
 *
 * @example
 * // With use case auto-resolution
 * const createTeam = createGrpcHandler({
 *   name: 'createTeam',
 *   errorKey: 'team.createFailed',
 *   useCaseToken: TOKENS.CreateTeamUseCase,
 *   handler: async (request, useCase) => {
 *     const result = await useCase.execute({ ... });
 *     return { success: true, team: { ... } };
 *   },
 * });
 */
export function createGrpcHandler<TRequest, TResponse, TUseCase>(
  options: HandlerWithUseCaseOptions<TRequest, TResponse, TUseCase>
): GrpcHandler<TRequest, TResponse>;

/**
 * Implementation
 */
export function createGrpcHandler<TRequest, TResponse, TUseCase = never>(
  options:
    | SimpleHandlerOptions<TRequest, TResponse>
    | HandlerWithUseCaseOptions<TRequest, TResponse, TUseCase>
): GrpcHandler<TRequest, TResponse> {
  const { name, errorKey, handler } = options;
  const hasUseCase = 'useCaseToken' in options;

  return async (
    call: grpc.ServerUnaryCall<TRequest, TResponse>,
    callback: GrpcCallback<TResponse>
  ): Promise<void> => {
    try {
      let response: TResponse;

      if (hasUseCase) {
        const useCaseOptions = options;
        const useCase = container.resolve<TUseCase>(useCaseOptions.useCaseToken);
        response = await (handler as HandlerWithUseCase<TRequest, TResponse, TUseCase>)(
          call.request,
          useCase
        );
      } else {
        response = await (handler as SimpleHandler<TRequest, TResponse>)(call.request);
      }

      callback(null, response);
    } catch (error) {
      logger.error({ err: error }, `gRPC ${name} failed`);
      callback(null, createGrpcErrorResponse(error, errorKey) as TResponse);
    }
  };
}

// ============================================
// BATCH HANDLER CREATION
// ============================================

/**
 * Handler definition for batch creation
 */
interface HandlerDefinition<TRequest, TResponse, TUseCase = never> {
  name: string;
  errorKey: string;
  useCaseToken?: string;
  handler: TUseCase extends never
    ? SimpleHandler<TRequest, TResponse>
    : HandlerWithUseCase<TRequest, TResponse, TUseCase>;
}

/**
 * Create multiple gRPC handlers at once
 *
 * @example
 * const handlers = createGrpcHandlers({
 *   createTeam: {
 *     name: 'createTeam',
 *     errorKey: 'team.createFailed',
 *     useCaseToken: TOKENS.CreateTeamUseCase,
 *     handler: async (req, useCase) => ({ success: true, ... }),
 *   },
 *   deleteTeam: {
 *     name: 'deleteTeam',
 *     errorKey: 'team.deleteFailed',
 *     useCaseToken: TOKENS.DeleteTeamUseCase,
 *     handler: async (req, useCase) => ({ success: true, ... }),
 *   },
 * });
 */
export function createGrpcHandlers<
  T extends Record<string, HandlerDefinition<unknown, unknown, unknown>>,
>(
  definitions: T
): {
  [K in keyof T]: GrpcHandler<
    T[K] extends HandlerDefinition<infer TReq, unknown, unknown> ? TReq : never,
    T[K] extends HandlerDefinition<unknown, infer TRes, unknown> ? TRes : never
  >;
} {
  const handlers: Record<string, GrpcHandler<unknown, unknown>> = {};

  for (const [key, definition] of Object.entries(definitions)) {
    if (definition.useCaseToken) {
      handlers[key] = createGrpcHandler({
        name: definition.name,
        errorKey: definition.errorKey,
        useCaseToken: definition.useCaseToken,
        handler: definition.handler,
      });
    } else {
      handlers[key] = createGrpcHandler({
        name: definition.name,
        errorKey: definition.errorKey,
        handler: definition.handler as SimpleHandler<unknown, unknown>,
      });
    }
  }

  return handlers as {
    [K in keyof T]: GrpcHandler<
      T[K] extends HandlerDefinition<infer TReq, unknown, unknown> ? TReq : never,
      T[K] extends HandlerDefinition<unknown, infer TRes, unknown> ? TRes : never
    >;
  };
}
