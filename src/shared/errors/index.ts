/**
 * Error Handling Module
 *
 * Clean, simple error handling based on isOperational flag.
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

// Error handlers (HTTP middleware)
export { errorHandler, notFoundHandler, asyncHandler } from './errorHandler.js';

// Error sanitization (with i18n support)
export { sanitizeErrorMessage, isSafeForFrontend, type ErrorType } from './errorSanitizer.js';

// gRPC error handling
export { createGrpcErrorResponse, isAppError, isOperationalError } from './grpcErrorHandler.js';
