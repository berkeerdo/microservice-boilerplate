/**
 * API Circuit Breaker
 *
 * Protects external API clients from cascade failures.
 * When an API is down, the circuit opens to prevent:
 * - Wasted money on failed API calls
 * - Queue backup from retries
 * - Cascade failures across the system
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: API is down, requests are rejected immediately
 * - HALF_OPEN: Testing if API recovered, limited requests allowed
 */
import logger from '../logger/logger.js';

// ============================================
// TYPES
// ============================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface APICircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit (default: 3) */
  failureThreshold: number;
  /** Time in ms before trying again after circuit opens (default: 60000) */
  resetTimeoutMs: number;
  /** Number of consecutive successes in HALF_OPEN to close circuit (default: 2) */
  halfOpenSuccessThreshold: number;
  /** Provider name for logging/metrics */
  provider: string;
}

export class CircuitBreakerOpenError extends Error {
  readonly provider: string;
  readonly resetTimeoutMs: number;

  constructor(provider: string, resetTimeoutMs: number) {
    super(`Circuit breaker OPEN for ${provider} - rejecting request`);
    this.name = 'CircuitBreakerOpenError';
    this.provider = provider;
    this.resetTimeoutMs = resetTimeoutMs;
  }
}

// ============================================
// IMPLEMENTATION
// ============================================

export class APICircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastFailureTime = 0;
  private lastStateChange = Date.now();

  private readonly config: APICircuitBreakerConfig;

  constructor(config: Partial<APICircuitBreakerConfig> & { provider: string }) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 3,
      resetTimeoutMs: config.resetTimeoutMs ?? 60000,
      halfOpenSuccessThreshold: config.halfOpenSuccessThreshold ?? 2,
      provider: config.provider,
    };
  }

  /**
   * Check if request should be allowed through
   * @throws CircuitBreakerOpenError if circuit is OPEN
   */
  guardRequest(): void {
    this.checkStateTransition();

    if (this.state === 'OPEN') {
      throw new CircuitBreakerOpenError(this.config.provider, this.config.resetTimeoutMs);
    }
  }

  /**
   * Record a successful API call
   */
  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.config.halfOpenSuccessThreshold) {
        this.transitionTo('CLOSED');
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
      }
    } else if (this.state === 'CLOSED') {
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Record a failed API call
   */
  recordFailure(): void {
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
    } else if (
      this.state === 'CLOSED' &&
      this.consecutiveFailures >= this.config.failureThreshold
    ) {
      this.transitionTo('OPEN');
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.checkStateTransition();
    return this.state;
  }

  /**
   * Get circuit breaker stats for monitoring
   */
  getStats(): {
    state: CircuitState;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    lastFailureTime: number;
    lastStateChange: number;
    provider: string;
  } {
    this.checkStateTransition();
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      provider: this.config.provider,
    };
  }

  /**
   * Reset circuit breaker to CLOSED state (for admin/testing)
   */
  reset(): void {
    this.transitionTo('CLOSED');
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = 0;
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private checkStateTransition(): void {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
        this.consecutiveSuccesses = 0;
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    if (oldState === newState) {
      return;
    }

    this.state = newState;
    this.lastStateChange = Date.now();

    const logData = {
      provider: this.config.provider,
      oldState,
      newState,
      consecutiveFailures: this.consecutiveFailures,
      resetTimeoutMs: this.config.resetTimeoutMs,
    };

    if (newState === 'OPEN') {
      logger.error(
        logData,
        `Circuit breaker OPENED for ${this.config.provider} after ${this.consecutiveFailures} failures`
      );
    } else if (newState === 'HALF_OPEN') {
      logger.info(
        logData,
        `Circuit breaker HALF_OPEN for ${this.config.provider} - testing recovery`
      );
    } else {
      logger.info(logData, `Circuit breaker CLOSED for ${this.config.provider} - recovered`);
    }
  }
}
