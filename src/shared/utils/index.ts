/**
 * Shared Utilities
 *
 * Export commonly used utility functions.
 */
export {
  encrypt,
  decrypt,
  generateSecureToken,
  generateCodeVerifier,
  generateCodeChallenge,
  hashSHA256,
} from './encryption.js';

export {
  parseDate,
  toISO,
  toMySQL,
  toMySQLNullable,
  nowUTC,
  nowISO,
  isExpired,
  isFuture,
  addTime,
} from './dateUtils.js';
export type { TimeUnit } from './dateUtils.js';

export {
  isValidEmail,
  validateEmails,
  validateEmailWithMessage,
  validateRequiredFields,
} from './validation.js';
export type { EmailValidationResult } from './validation.js';

export { sendEmailSafely, sendEmailWithResult, createEmailSender } from './emailHelper.js';
export type { EmailContext } from './emailHelper.js';

export {
  createBatches,
  processBatches,
  processBatchesWithResults,
  processWithConcurrency,
  processWithConcurrencyResults,
  aggregateResults,
} from './parallelProcessor.js';
export type { ParallelProcessorOptions, ProcessResult } from './parallelProcessor.js';

export {
  OperationTimer,
  CheckpointTimer,
  measureAsync,
  measureSync,
  startTimer,
} from './OperationTimer.js';
export type { TimedResult, TimerStats } from './OperationTimer.js';

export { FilterQueryBuilder } from './FilterQueryBuilder.js';
export type { QueryCondition, FilterCondition } from './FilterQueryBuilder.js';
