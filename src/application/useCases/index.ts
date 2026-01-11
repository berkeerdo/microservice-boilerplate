/**
 * Use Cases Barrel Export
 *
 * Export all use cases from this file for clean imports:
 * import { CreateExampleUseCase, GetExampleUseCase } from './application/useCases';
 */

export { BaseUseCase, type IUseCase } from './BaseUseCase.js';

// Example Use Cases
export {
  CreateExampleUseCase,
  GetExampleUseCase,
  ListExamplesUseCase,
  UpdateExampleUseCase,
  DeleteExampleUseCase,
  type CreateExampleInput,
  type CreateExampleOutput,
  type GetExampleInput,
  type GetExampleOutput,
  type ListExamplesInput,
  type ListExamplesOutput,
  type UpdateExampleInput,
  type UpdateExampleOutput,
  type DeleteExampleInput,
  type DeleteExampleOutput,
} from './example/index.js';
