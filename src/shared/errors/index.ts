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

// Error sanitization
export {
  sanitizeError,
  isSafeForFrontend,
  DEFAULT_ERROR_MESSAGE,
  SERVICE_UNAVAILABLE_MESSAGE,
} from './errorSanitizer.js';

// gRPC error handling
export {
  createGrpcErrorResponse,
  isAppError,
  isOperationalError,
  type GrpcErrorResponse,
} from './grpcErrorHandler.js';
