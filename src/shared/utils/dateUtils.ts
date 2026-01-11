/**
 * Date Utilities
 *
 * Standardized date handling utilities for consistent date operations.
 * All dates are handled in UTC by default.
 */

/**
 * Parse various date inputs into a Date object
 *
 * @param value - Date value to parse (Date, string, number, null, undefined)
 * @returns Date object or null if invalid
 *
 * @example
 * parseDate('2025-01-15T10:00:00Z') // Date
 * parseDate(1705309200000) // Date
 * parseDate(new Date()) // Date
 * parseDate(null) // null
 */
export function parseDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * Convert Date to ISO 8601 string (UTC)
 *
 * @param date - Date to convert
 * @returns ISO string or null
 *
 * @example
 * toISO(new Date()) // '2025-01-15T10:00:00.000Z'
 * toISO(null) // null
 */
export function toISO(date: Date | null | undefined): string | null {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

/**
 * Convert Date to MySQL DATETIME format (UTC)
 *
 * @param date - Date to convert
 * @returns MySQL datetime string or 'NOW()' for null/undefined
 *
 * @example
 * toMySQL(new Date()) // '2025-01-15 10:00:00'
 * toMySQL(null) // 'NOW()'
 */
export function toMySQL(date: Date | null | undefined): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return 'NOW()';
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Convert Date to MySQL DATETIME format, returning null for invalid dates
 *
 * @param date - Date to convert
 * @returns MySQL datetime string or null
 *
 * @example
 * toMySQLNullable(new Date()) // '2025-01-15 10:00:00'
 * toMySQLNullable(null) // null
 */
export function toMySQLNullable(date: Date | null | undefined): string | null {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Get current UTC Date
 *
 * @returns Current Date in UTC
 *
 * @example
 * nowUTC() // Date object representing current UTC time
 */
export function nowUTC(): Date {
  return new Date();
}

/**
 * Get current UTC time as ISO string
 *
 * @returns Current ISO string
 *
 * @example
 * nowISO() // '2025-01-15T10:00:00.000Z'
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Check if a date is in the past (expired)
 *
 * @param date - Date to check
 * @returns true if date is before now
 *
 * @example
 * isExpired(new Date('2020-01-01')) // true
 * isExpired(new Date('2030-01-01')) // false
 */
export function isExpired(date: Date | null | undefined): boolean {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return true; // Treat invalid dates as expired
  }
  return date.getTime() < Date.now();
}

/**
 * Check if a date is in the future
 *
 * @param date - Date to check
 * @returns true if date is after now
 *
 * @example
 * isFuture(new Date('2030-01-01')) // true
 * isFuture(new Date('2020-01-01')) // false
 */
export function isFuture(date: Date | null | undefined): boolean {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return false; // Treat invalid dates as not future
  }
  return date.getTime() > Date.now();
}

/**
 * Time unit for addTime function
 */
export type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks';

/**
 * Add time to a date
 *
 * @param date - Base date
 * @param amount - Amount to add (can be negative)
 * @param unit - Time unit
 * @returns New Date with time added
 *
 * @example
 * addTime(new Date(), 1, 'hours') // 1 hour from now
 * addTime(new Date(), -30, 'minutes') // 30 minutes ago
 * addTime(new Date(), 7, 'days') // 7 days from now
 */
export function addTime(date: Date, amount: number, unit: TimeUnit): Date {
  const ms = {
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
  };

  return new Date(date.getTime() + amount * ms[unit]);
}
