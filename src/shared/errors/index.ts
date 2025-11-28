/**
 * Error Handling Module
 */

// Error classes
export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  RateLimitError,
  ServiceUnavailableError,
  TimeoutError,
  DatabaseError,
  ExternalServiceError,
  type ErrorDetails,
} from './AppError.js';

// Error handlers
export { errorHandler, notFoundHandler, asyncHandler } from './errorHandler.js';
