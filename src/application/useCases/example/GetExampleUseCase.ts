import { BaseUseCase } from '../BaseUseCase.js';
import { Logger } from '../../../infra/logger/logger.js';
import { IExampleRepository } from '../../../infra/db/repositories/ExampleRepository.js';

/**
 * Get Example Input
 */
export interface GetExampleInput {
  id: number;
}

/**
 * Get Example Output
 */
export interface GetExampleOutput {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get Example Use Case
 * Retrieves a single example by ID
 */
export class GetExampleUseCase extends BaseUseCase<GetExampleInput, GetExampleOutput | null> {
  constructor(
    private readonly exampleRepository: IExampleRepository,
    logger: Logger
  ) {
    super(logger);
  }

  async execute(input: GetExampleInput): Promise<GetExampleOutput | null> {
    this.logStart('GetExampleUseCase', { id: input.id });

    const example = await this.exampleRepository.findById(input.id);

    if (!example) {
      this.logger.info({ id: input.id }, 'Example not found');
      return null;
    }

    const result: GetExampleOutput = {
      id: example.id,
      name: example.name,
      createdAt: example.createdAt,
      updatedAt: example.updatedAt,
    };

    this.logSuccess('GetExampleUseCase', { id: example.id });
    return result;
  }
}
