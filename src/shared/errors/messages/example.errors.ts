/**
 * Example Error Constants
 *
 * This file demonstrates the domain-specific error constants pattern.
 * Create similar files for each domain entity in your service.
 *
 * Benefits:
 * - Type-safe error keys
 * - Centralized error management
 * - i18n support (keys match translation files)
 * - IDE autocomplete
 *
 * Usage:
 * ```typescript
 * import { ExampleErrors } from '../shared/errors/index.js';
 * import { NotFoundError } from '../shared/errors/index.js';
 *
 * throw new NotFoundError(ExampleErrors.NOT_FOUND, { id });
 * ```
 *
 * Translation files (locales/en.json):
 * ```json
 * {
 *   "example.notFound": "Example not found",
 *   "example.alreadyExists": "Example already exists"
 * }
 * ```
 */

// ============================================
// EXAMPLE ENTITY ERRORS
// ============================================

export const ExampleErrors = {
  NOT_FOUND: 'example.notFound',
  ALREADY_EXISTS: 'example.alreadyExists',
  CREATE_FAILED: 'example.createFailed',
  UPDATE_FAILED: 'example.updateFailed',
  DELETE_FAILED: 'example.deleteFailed',
  VALIDATION_FAILED: 'example.validationFailed',
  INVALID_STATUS: 'example.invalidStatus',
} as const;

// ============================================
// DATABASE ERRORS
// ============================================

export const DatabaseErrors = {
  CONNECTION_FAILED: 'database.connectionFailed',
  QUERY_FAILED: 'database.queryFailed',
  TRANSACTION_FAILED: 'database.transactionFailed',
  DUPLICATE_ENTRY: 'database.duplicateEntry',
  CONSTRAINT_VIOLATION: 'database.constraintViolation',
} as const;

// ============================================
// EXTERNAL SERVICE ERRORS
// ============================================

export const ExternalServiceErrors = {
  UNAVAILABLE: 'externalService.unavailable',
  TIMEOUT: 'externalService.timeout',
  RATE_LIMITED: 'externalService.rateLimited',
  INVALID_RESPONSE: 'externalService.invalidResponse',
  AUTHENTICATION_FAILED: 'externalService.authenticationFailed',
} as const;

// ============================================
// TYPE EXPORTS
// ============================================

export type ExampleErrorType = (typeof ExampleErrors)[keyof typeof ExampleErrors];
export type DatabaseErrorType = (typeof DatabaseErrors)[keyof typeof DatabaseErrors];
export type ExternalServiceErrorType =
  (typeof ExternalServiceErrors)[keyof typeof ExternalServiceErrors];
