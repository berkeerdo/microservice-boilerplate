import { BaseUseCase } from '../BaseUseCase.js';
import { Logger } from '../../../infra/logger/logger.js';
import { Example } from '../../../domain/models/Example.js';
import { IExampleRepository } from '../../../infra/db/repositories/ExampleRepository.js';

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
 * Demonstrates how to create a use case with validation and business logic
 */
export class CreateExampleUseCase extends BaseUseCase<CreateExampleInput, CreateExampleOutput> {
  constructor(
    private readonly exampleRepository: IExampleRepository,
    logger: Logger
  ) {
    super(logger);
  }

  async execute(input: CreateExampleInput): Promise<CreateExampleOutput> {
    this.logStart('CreateExampleUseCase', { name: input.name });

    // Business rule: name must be unique
    const existing = await this.exampleRepository.findByName(input.name);
    if (existing) {
      this.logError('CreateExampleUseCase', new Error('Example already exists'));
      throw new Error(`Example with name "${input.name}" already exists`);
    }

    // Create domain entity
    const example = Example.create({ name: input.name });

    // Persist to database
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
