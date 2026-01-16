/**
 * Scheduler Types & Configuration
 *
 * Shared types for job scheduling and circuit breaker patterns.
 * Used by JobHealthManager and any cron-based scheduler.
 */

// ============================================
// JOB HEALTH TYPES
// ============================================

export type JobState = 'healthy' | 'degraded' | 'failed';

export interface JobHealth {
  state: JobState;
  consecutiveFailures: number;
  lastError: string | null;
  lastFailureAt: Date | null;
  circuitOpenUntil: Date | null;
}

export type JobHealthMap<T extends string = string> = Map<T, JobHealth>;

// ============================================
// CIRCUIT BREAKER CONFIG
// ============================================

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before circuit opens */
  maxConsecutiveFailures: number;
  /** Time in ms to wait before attempting retry after circuit opens */
  circuitCooldownMs: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  maxConsecutiveFailures: 3,
  circuitCooldownMs: 30 * 60 * 1000, // 30 minutes
};

// ============================================
// HELPERS
// ============================================

export const createDefaultJobHealth = (): JobHealth => ({
  state: 'healthy',
  consecutiveFailures: 0,
  lastError: null,
  lastFailureAt: null,
  circuitOpenUntil: null,
});
