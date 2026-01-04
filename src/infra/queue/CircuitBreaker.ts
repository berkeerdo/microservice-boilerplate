/**
 * Circuit Breaker Pattern for RabbitMQ
 * Prevents cascading failures by temporarily stopping operations when errors exceed threshold
 *
 * States:
 * - CLOSED: Normal operation, all requests pass through
 * - OPEN: Failure threshold exceeded, all requests fail immediately
 * - HALF_OPEN: Testing if service has recovered (allows limited requests)
 *
 * Best Practice: Use circuit breaker for both consumers and publishers to handle
 * temporary RabbitMQ unavailability gracefully.
 */
import logger from '../logger/logger.js';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /** Name for logging purposes */
  name: string;
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms to wait before attempting recovery (default: 30000) */
  resetTimeout?: number;
  /** Number of successful calls in half-open state before closing (default: 3) */
  successThreshold?: number;
  /** Time window in ms to count failures (default: 60000) */
  failureWindow?: number;
}

interface FailureRecord {
  timestamp: number;
  error: Error;
}

/**
 * CircuitBreaker - Implements the circuit breaker pattern
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: FailureRecord[] = [];
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      failureThreshold: 5,
      resetTimeout: 30000,
      successThreshold: 3,
      failureWindow: 60000,
      ...options,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitBreakerOpenError(
          `Circuit breaker is open for ${this.options.name}`,
          this.getRemainingResetTime()
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Record a success
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Clear old failures outside the window
      this.cleanupOldFailures();
    }
  }

  /**
   * Record a failure
   */
  private onFailure(error: Error): void {
    this.lastFailureTime = Date.now();
    this.failures.push({ timestamp: Date.now(), error });
    this.cleanupOldFailures();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failures.length >= this.options.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * Remove failures outside the failure window
   */
  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.options.failureWindow;
    this.failures = this.failures.filter((f) => f.timestamp > cutoff);
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;

    if (newState === CircuitState.CLOSED) {
      this.failures = [];
      this.successCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }

    logger.info(
      {
        circuitBreaker: this.options.name,
        previousState,
        newState,
        failureCount: this.failures.length,
      },
      'Circuit breaker state changed'
    );
  }

  /**
   * Get remaining time before reset attempt
   */
  private getRemainingResetTime(): number {
    return Math.max(0, this.options.resetTimeout - (Date.now() - this.lastFailureTime));
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker stats
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    remainingResetTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failures.length,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      remainingResetTime: this.state === CircuitState.OPEN ? this.getRemainingResetTime() : 0,
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    logger.info({ circuitBreaker: this.options.name }, 'Circuit breaker manually reset');
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  readonly remainingResetTime: number;

  constructor(message: string, remainingResetTime: number) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.remainingResetTime = remainingResetTime;
  }
}
