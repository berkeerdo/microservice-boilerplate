/**
 * Job Health Manager
 *
 * Implements Circuit Breaker pattern for scheduled jobs and background tasks.
 * Tracks job health states and prevents cascading failures.
 *
 * States:
 * - healthy: Job running normally
 * - degraded: Failures detected but still attempting
 * - failed: Circuit open, skipping execution until cooldown
 *
 * Usage:
 * ```typescript
 * type MyJobType = 'sync' | 'cleanup' | 'report';
 *
 * const healthManager = new JobHealthManager<MyJobType>(
 *   ['sync', 'cleanup', 'report'],
 *   { maxConsecutiveFailures: 3, circuitCooldownMs: 30 * 60 * 1000 }
 * );
 *
 * // In job execution
 * if (healthManager.isCircuitOpen('sync')) {
 *   logger.warn('Sync job skipped - circuit breaker open');
 *   return;
 * }
 *
 * try {
 *   await runSyncJob();
 *   healthManager.recordSuccess('sync');
 * } catch (error) {
 *   healthManager.recordFailure('sync', error);
 * }
 * ```
 */
import { AppError } from '../../shared/errors/index.js';
import logger from '../logger/logger.js';
import {
  type JobHealth,
  type JobHealthMap,
  type CircuitBreakerConfig,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  createDefaultJobHealth,
} from './schedulerTypes.js';

export class JobHealthManager<T extends string = string> {
  private readonly jobHealth: JobHealthMap<T>;
  private readonly config: CircuitBreakerConfig;

  constructor(jobTypes: T[], config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.jobHealth = new Map<T, JobHealth>();

    // Initialize health for all job types
    for (const jobType of jobTypes) {
      this.jobHealth.set(jobType, createDefaultJobHealth());
    }
  }

  /**
   * Check if circuit is open (job should be skipped)
   */
  isCircuitOpen(jobType: T): boolean {
    const health = this.jobHealth.get(jobType);
    if (!health?.circuitOpenUntil) {
      return false;
    }

    // Check if cooldown period has passed
    if (new Date() >= health.circuitOpenUntil) {
      // Reset to degraded state to allow retry
      health.state = 'degraded';
      health.circuitOpenUntil = null;
      logger.info({ jobType }, 'Circuit breaker cooldown expired - allowing retry');
      return false;
    }

    return true;
  }

  /**
   * Record job success - resets circuit breaker
   */
  recordSuccess(jobType: T): void {
    const health = this.jobHealth.get(jobType);
    if (health) {
      const wasNotHealthy = health.state !== 'healthy';
      health.state = 'healthy';
      health.consecutiveFailures = 0;
      health.lastError = null;
      health.circuitOpenUntil = null;

      if (wasNotHealthy) {
        logger.info({ jobType }, 'Job recovered - circuit breaker reset');
      }
    }
  }

  /**
   * Record job failure - may open circuit
   */
  recordFailure(jobType: T, error: unknown): void {
    const health = this.jobHealth.get(jobType);
    if (!health) {
      return;
    }

    const err = error instanceof Error ? error : new Error(String(error));
    health.consecutiveFailures++;
    health.lastError = err.message;
    health.lastFailureAt = new Date();

    // Classify error - operational errors are expected, non-operational are critical
    const isOperational = error instanceof AppError && error.isOperational;

    if (health.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      // Open circuit - stop trying for cooldown period
      health.state = 'failed';
      health.circuitOpenUntil = new Date(Date.now() + this.config.circuitCooldownMs);

      logger.error(
        {
          jobType,
          consecutiveFailures: health.consecutiveFailures,
          cooldownMinutes: this.config.circuitCooldownMs / 60000,
          isOperational,
          error: health.lastError,
        },
        'Circuit breaker opened - job paused'
      );
    } else {
      // Degraded state - continue trying but track
      health.state = 'degraded';

      logger.warn(
        {
          jobType,
          consecutiveFailures: health.consecutiveFailures,
          maxFailures: this.config.maxConsecutiveFailures,
          isOperational,
          error: health.lastError,
        },
        'Job degraded - failures increasing'
      );
    }
  }

  /**
   * Get job health status for monitoring
   */
  getJobHealth(): JobHealthMap<T> {
    return new Map(this.jobHealth);
  }

  /**
   * Get health for a specific job type
   */
  getHealth(jobType: T): JobHealth | undefined {
    return this.jobHealth.get(jobType);
  }

  /**
   * Reset health for a specific job type
   */
  resetHealth(jobType: T): void {
    this.jobHealth.set(jobType, createDefaultJobHealth());
    logger.info({ jobType }, 'Job health reset');
  }

  /**
   * Reset all job health states
   */
  resetAll(): void {
    for (const jobType of this.jobHealth.keys()) {
      this.jobHealth.set(jobType, createDefaultJobHealth());
    }
    logger.info('All job health states reset');
  }

  /**
   * Get summary of all job health states
   */
  getSummary(): Record<T, { state: JobHealth['state']; failures: number }> {
    const summary = {} as Record<T, { state: JobHealth['state']; failures: number }>;
    for (const [jobType, health] of this.jobHealth) {
      summary[jobType] = {
        state: health.state,
        failures: health.consecutiveFailures,
      };
    }
    return summary;
  }

  /**
   * Check if any job is in failed state
   */
  hasFailedJobs(): boolean {
    for (const health of this.jobHealth.values()) {
      if (health.state === 'failed') {
        return true;
      }
    }
    return false;
  }

  /**
   * Get list of failed job types
   */
  getFailedJobs(): T[] {
    const failed: T[] = [];
    for (const [jobType, health] of this.jobHealth) {
      if (health.state === 'failed') {
        failed.push(jobType);
      }
    }
    return failed;
  }
}
