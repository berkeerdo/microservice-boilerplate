import { BaseUseCase } from '../BaseUseCase.js';
import { Logger } from '../../../infra/logger/logger.js';
import { IExampleRepository } from '../../../infra/db/repositories/ExampleRepository.js';

/**
 * Delete Example Input
 */
export interface DeleteExampleInput {
  id: number;
}

/**
 * Delete Example Output
 */
export interface DeleteExampleOutput {
  success: boolean;
  id: number;
}

/**
 * Delete Example Use Case
 * Deletes an example by ID
 */
export class DeleteExampleUseCase extends BaseUseCase<DeleteExampleInput, DeleteExampleOutput> {
  constructor(
    private readonly exampleRepository: IExampleRepository,
    logger: Logger
  ) {
    super(logger);
  }

  async execute(input: DeleteExampleInput): Promise<DeleteExampleOutput> {
    this.logStart('DeleteExampleUseCase', { id: input.id });

    // Check if example exists
    const existing = await this.exampleRepository.findById(input.id);
    if (!existing) {
      this.logger.info({ id: input.id }, 'Example not found for deletion');
      return { success: false, id: input.id };
    }

    // Delete
    const deleted = await this.exampleRepository.delete(input.id);

    if (!deleted) {
      this.logError('DeleteExampleUseCase', new Error('Delete failed'));
      return { success: false, id: input.id };
    }

    this.logSuccess('DeleteExampleUseCase', { id: input.id });
    return { success: true, id: input.id };
  }
}
