import { BaseUseCase } from '../BaseUseCase.js';
import type { Logger } from '../../../infra/logger/logger.js';
import type { IExampleRepository } from '../../../infra/db/repositories/ExampleRepository.js';

/**
 * List Examples Input
 */
export interface ListExamplesInput {
  limit?: number;
  offset?: number;
}

/**
 * List Examples Output Item
 */
export interface ExampleListItem {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * List Examples Output
 */
export interface ListExamplesOutput {
  items: ExampleListItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * List Examples Use Case
 * Retrieves a paginated list of examples
 */
export class ListExamplesUseCase extends BaseUseCase<ListExamplesInput, ListExamplesOutput> {
  constructor(
    private readonly exampleRepository: IExampleRepository,
    logger: Logger
  ) {
    super(logger);
  }

  async execute(input: ListExamplesInput): Promise<ListExamplesOutput> {
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    this.logStart('ListExamplesUseCase', { limit, offset });

    const examples = await this.exampleRepository.findAll(limit, offset);

    const items: ExampleListItem[] = examples.map((example) => ({
      id: example.id,
      name: example.name,
      createdAt: example.createdAt,
      updatedAt: example.updatedAt,
    }));

    const result: ListExamplesOutput = {
      items,
      total: items.length,
      limit,
      offset,
    };

    this.logSuccess('ListExamplesUseCase', { count: items.length });
    return result;
  }
}
