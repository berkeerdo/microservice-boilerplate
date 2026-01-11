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
