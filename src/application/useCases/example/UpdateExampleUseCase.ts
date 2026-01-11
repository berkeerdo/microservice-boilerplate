import { BaseUseCase } from '../BaseUseCase.js';
import type { Logger } from '../../../infra/logger/logger.js';
import type { IExampleRepository } from '../../../infra/db/repositories/ExampleRepository.js';

/**
 * Update Example Input
 */
export interface UpdateExampleInput {
  id: number;
  name?: string;
}

/**
 * Update Example Output
 */
export interface UpdateExampleOutput {
  id: number;
  name: string;
  updatedAt: Date;
}

/**
 * Update Example Use Case
 * Updates an existing example
 */
export class UpdateExampleUseCase extends BaseUseCase<
  UpdateExampleInput,
  UpdateExampleOutput | null
> {
  constructor(
    private readonly exampleRepository: IExampleRepository,
    logger: Logger
  ) {
    super(logger);
  }

  async execute(input: UpdateExampleInput): Promise<UpdateExampleOutput | null> {
    this.logStart('UpdateExampleUseCase', { id: input.id });

    // Check if example exists
    const existing = await this.exampleRepository.findById(input.id);
    if (!existing) {
      this.logger.info({ id: input.id }, 'Example not found for update');
      return null;
    }

    // Business rule: if updating name, check uniqueness
    if (input.name && input.name !== existing.name) {
      const duplicate = await this.exampleRepository.findByName(input.name);
      if (duplicate) {
        this.logError('UpdateExampleUseCase', new Error('Name already exists'));
        throw new Error(`Example with name "${input.name}" already exists`);
      }
    }

    // Update
    const updated = await this.exampleRepository.update(input.id, {
      name: input.name,
    });

    if (!updated) {
      this.logError('UpdateExampleUseCase', new Error('Update failed'));
      throw new Error('Failed to update example');
    }

    // Fetch updated entity
    const result = await this.exampleRepository.findById(input.id);
    if (!result) {
      throw new Error('Failed to fetch updated example');
    }

    const output: UpdateExampleOutput = {
      id: result.id,
      name: result.name,
      updatedAt: result.updatedAt,
    };

    this.logSuccess('UpdateExampleUseCase', { id: input.id });
    return output;
  }
}
