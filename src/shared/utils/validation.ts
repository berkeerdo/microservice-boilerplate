/**
 * Validation Utilities
 *
 * Common validation functions used across the application.
 * Centralizes validation logic to avoid duplication.
 * Uses Zod for consistent validation across the application.
 */
import { z } from 'zod';

// Zod email schema - singleton for performance
const emailSchema = z.email();

/**
 * Validate email address format using Zod
 *
 * Uses Zod's built-in email validation which follows RFC 5322.
 *
 * @param email - Email address to validate
 * @returns true if email format is valid
 *
 * @example
 * isValidEmail('user@example.com') // true
 * isValidEmail('invalid-email') // false
 * isValidEmail('user@domain') // false (no TLD)
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const result = emailSchema.safeParse(email.trim());
  return result.success;
}

/**
 * Validate multiple email addresses
 *
 * @param emails - Array of email addresses to validate
 * @returns Object with valid and invalid emails
 *
 * @example
 * validateEmails(['valid@test.com', 'invalid'])
 * // { valid: ['valid@test.com'], invalid: ['invalid'] }
 */
export function validateEmails(emails: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const email of emails) {
    if (isValidEmail(email)) {
      valid.push(email.trim());
    } else {
      invalid.push(email);
    }
  }

  return { valid, invalid };
}

/**
 * Email validation result
 */
export interface EmailValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate email with detailed error message
 *
 * @param email - Email address to validate
 * @returns Validation result with error message if invalid
 *
 * @example
 * validateEmailWithMessage('') // { isValid: false, error: 'Email address is required' }
 * validateEmailWithMessage('invalid') // { isValid: false, error: 'Invalid email address format' }
 * validateEmailWithMessage('valid@test.com') // { isValid: true }
 */
export function validateEmailWithMessage(email: string | undefined): EmailValidationResult {
  if (!email || email.trim() === '') {
    return { isValid: false, error: 'Email address is required' };
  }

  if (!isValidEmail(email)) {
    return { isValid: false, error: 'Invalid email address format' };
  }

  return { isValid: true };
}

/**
 * Validate required fields
 *
 * @param fields - Object with field names and values
 * @returns Array of missing field names
 *
 * @example
 * validateRequiredFields({ email: 'test@test.com', name: '' })
 * // ['name']
 */
export function validateRequiredFields(fields: Record<string, unknown>): string[] {
  const missing: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') {
      missing.push(key);
    }
  }

  return missing;
}
