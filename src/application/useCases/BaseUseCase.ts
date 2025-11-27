import { Logger } from '../../infra/logger/logger.js';

/**
 * Base Use Case Interface
 * All use cases should implement this interface
 */
export interface IUseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}

/**
 * Base Use Case Abstract Class
 * Provides common functionality for all use cases
 */
export abstract class BaseUseCase<TInput, TOutput> implements IUseCase<TInput, TOutput> {
  constructor(protected readonly logger: Logger) {}

  /**
   * Execute the use case
   * Override this method in concrete implementations
   */
  abstract execute(input: TInput): Promise<TOutput>;

  /**
   * Log use case execution start
   */
  protected logStart(useCaseName: string, input?: unknown): void {
    this.logger.info({ useCase: useCaseName, input }, `Starting ${useCaseName}`);
  }

  /**
   * Log use case execution success
   */
  protected logSuccess(useCaseName: string, result?: unknown): void {
    this.logger.info({ useCase: useCaseName, result }, `${useCaseName} completed successfully`);
  }

  /**
   * Log use case execution failure
   */
  protected logError(useCaseName: string, error: unknown): void {
    this.logger.error({ useCase: useCaseName, err: error }, `${useCaseName} failed`);
  }
}
