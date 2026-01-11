import type { AwilixContainer } from 'awilix';
import { createContainer, asValue, asClass, asFunction, InjectionMode } from 'awilix';
import type { Logger } from './infra/logger/logger.js';
import logger from './infra/logger/logger.js';
import type { IExampleRepository } from './domain/repositories/index.js';
import { InMemoryExampleRepository } from './infra/db/repositories/ExampleRepository.js';
import { TransactionManager } from './infra/db/TransactionManager.js';
import {
  CreateExampleUseCase,
  GetExampleUseCase,
  ListExamplesUseCase,
  UpdateExampleUseCase,
  DeleteExampleUseCase,
} from './application/useCases/index.js';

/**
 * Container Cradle Interface
 * Defines all available dependencies with their types
 */
export interface Cradle {
  // Infrastructure
  logger: Logger;
  transactionManager: TransactionManager;

  // Repositories
  exampleRepository: IExampleRepository;

  // Use Cases
  createExampleUseCase: CreateExampleUseCase;
  getExampleUseCase: GetExampleUseCase;
  listExamplesUseCase: ListExamplesUseCase;
  updateExampleUseCase: UpdateExampleUseCase;
  deleteExampleUseCase: DeleteExampleUseCase;
}

/**
 * Dependency Injection Tokens
 * Use these tokens for type-safe dependency resolution
 */
export const TOKENS = {
  // Infrastructure
  Logger: 'logger',
  TransactionManager: 'transactionManager',

  // Repositories
  ExampleRepository: 'exampleRepository',

  // Use Cases
  CreateExampleUseCase: 'createExampleUseCase',
  GetExampleUseCase: 'getExampleUseCase',
  ListExamplesUseCase: 'listExamplesUseCase',
  UpdateExampleUseCase: 'updateExampleUseCase',
  DeleteExampleUseCase: 'deleteExampleUseCase',
} as const;

/**
 * Create and configure the DI container
 */
export const container: AwilixContainer<Cradle> = createContainer<Cradle>({
  injectionMode: InjectionMode.PROXY,
  strict: true,
});

/**
 * Register all dependencies in the DI container
 * Call this function once at app startup.
 */
export function registerDependencies(): AwilixContainer<Cradle> {
  container.register({
    // ============================================
    // INFRASTRUCTURE
    // ============================================
    logger: asValue(logger),
    transactionManager: asClass(TransactionManager).singleton(),

    // ============================================
    // REPOSITORIES
    // ============================================
    // Using InMemoryExampleRepository for demo
    // Replace with ExampleRepository when database is configured
    exampleRepository: asClass(InMemoryExampleRepository).singleton(),

    // For production with MySQL:
    // exampleRepository: asClass(ExampleRepository).singleton(),

    // ============================================
    // USE CASES
    // ============================================
    createExampleUseCase: asFunction(
      ({ exampleRepository, logger }: Cradle) => new CreateExampleUseCase(exampleRepository, logger)
    ).transient(),

    getExampleUseCase: asFunction(
      ({ exampleRepository, logger }: Cradle) => new GetExampleUseCase(exampleRepository, logger)
    ).transient(),

    listExamplesUseCase: asFunction(
      ({ exampleRepository, logger }: Cradle) => new ListExamplesUseCase(exampleRepository, logger)
    ).transient(),

    updateExampleUseCase: asFunction(
      ({ exampleRepository, logger }: Cradle) => new UpdateExampleUseCase(exampleRepository, logger)
    ).transient(),

    deleteExampleUseCase: asFunction(
      ({ exampleRepository, logger }: Cradle) => new DeleteExampleUseCase(exampleRepository, logger)
    ).transient(),
  });

  logger.info('Dependency injection container initialized');
  return container;
}
