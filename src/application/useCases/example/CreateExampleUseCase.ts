import { BaseUseCase } from '../BaseUseCase.js';
import { Logger } from '../../../infra/logger/logger.js';
import { Example } from '../../../domain/models/Example.js';
import { IExampleRepository } from '../../../infra/db/repositories/ExampleRepository.js';
import { ConflictError } from '../../../shared/errors/index.js';

/**
 * Create Example Input
 */
export interface CreateExampleInput {
  name: string;
}

/**
 * Create Example Output
 */
export interface CreateExampleOutput {
  id: number;
  name: string;
  createdAt: Date;
}

/**
 * Create Example Use Case
 * Demonstrates how to create a use case with:
 * - Input validation — Business logic.
 */
export class CreateExampleUseCase extends BaseUseCase<CreateExampleInput, CreateExampleOutput> {
  constructor(
    private readonly exampleRepository: IExampleRepository,
    logger: Logger
  ) {
    super(logger);
  }

  async execute(input: CreateExampleInput, _correlationId?: string): Promise<CreateExampleOutput> {
    this.logStart('CreateExampleUseCase', { name: input.name });

    // Business rule: name must be unique
    const existing = await this.exampleRepository.findByName(input.name);
    if (existing) {
      this.logError('CreateExampleUseCase', new Error('Example already exists'));
      throw new ConflictError(`Example with name "${input.name}" already exists`, {
        field: 'name',
        value: input.name,
      });
    }

    // Create a domain entity
    const example = Example.create({ name: input.name });

    // Persist to a database
    const id = await this.exampleRepository.create({
      name: example.name,
    });

    const result: CreateExampleOutput = {
      id,
      name: example.name,
      createdAt: example.createdAt,
    };

    this.logSuccess('CreateExampleUseCase', { id });
    return result;
  }
}
