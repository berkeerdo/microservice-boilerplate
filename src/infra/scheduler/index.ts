/**
 * Scheduler Infrastructure
 *
 * Provides circuit breaker pattern for scheduled jobs and background tasks.
 * Use JobHealthManager to track job health and prevent cascading failures.
 */
export { JobHealthManager } from './JobHealthManager.js';
export * from './schedulerTypes.js';
