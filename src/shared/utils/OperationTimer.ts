/**
 * OperationTimer
 *
 * Utility for measuring operation duration consistently across use cases.
 * Eliminates repeated timing boilerplate code.
 *
 * Usage:
 * ```typescript
 * // Sync timing
 * const timer = OperationTimer.start();
 * // ... do work
 * const duration = timer.stop();
 *
 * // Async timing with result
 * const { result, durationMs } = await OperationTimer.measure(async () => {
 *   return await someAsyncOperation();
 * });
 *
 * // With logging
 * const { result, durationMs } = await OperationTimer.measureWithLog(
 *   'FetchData',
 *   async () => fetchData(),
 *   logger
 * );
 * ```
 */
import type { Logger } from '../../infra/logger/logger.js';

export interface TimedResult<T> {
  result: T;
  durationMs: number;
}

export interface TimerStats {
  startTime: number;
  endTime?: number;
  durationMs?: number;
}

export class OperationTimer {
  private startTime: number;
  private endTime?: number;

  private constructor() {
    this.startTime = Date.now();
  }

  /**
   * Start a new timer
   */
  static start(): OperationTimer {
    return new OperationTimer();
  }

  /**
   * Stop the timer and return duration in milliseconds
   */
  stop(): number {
    this.endTime = Date.now();
    return this.durationMs;
  }

  /**
   * Get duration without stopping (for checkpoints)
   */
  elapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get final duration (only valid after stop())
   */
  get durationMs(): number {
    return (this.endTime ?? Date.now()) - this.startTime;
  }

  /**
   * Get timer statistics
   */
  getStats(): TimerStats {
    return {
      startTime: this.startTime,
      endTime: this.endTime,
      durationMs: this.endTime ? this.durationMs : undefined,
    };
  }

  /**
   * Measure an async operation and return result with duration
   */
  static async measure<T>(operation: () => Promise<T>): Promise<TimedResult<T>> {
    const timer = OperationTimer.start();
    const result = await operation();
    return {
      result,
      durationMs: timer.stop(),
    };
  }

  /**
   * Measure a sync operation and return result with duration
   */
  static measureSync<T>(operation: () => T): TimedResult<T> {
    const timer = OperationTimer.start();
    const result = operation();
    return {
      result,
      durationMs: timer.stop(),
    };
  }

  /**
   * Measure with automatic start/end logging
   */
  static async measureWithLog<T>(
    operationName: string,
    operation: () => Promise<T>,
    logger: Logger,
    context?: Record<string, unknown>
  ): Promise<TimedResult<T>> {
    logger.debug({ ...context, operation: operationName }, `Starting ${operationName}`);

    const timer = OperationTimer.start();

    try {
      const result = await operation();
      const durationMs = timer.stop();

      logger.info(
        { ...context, operation: operationName, durationMs },
        `${operationName} completed`
      );

      return { result, durationMs };
    } catch (error) {
      const durationMs = timer.stop();
      logger.error(
        { err: error, ...context, operation: operationName, durationMs },
        `${operationName} failed`
      );
      throw error;
    }
  }

  /**
   * Create a timer that tracks multiple checkpoints
   */
  static createCheckpointed(): CheckpointTimer {
    return new CheckpointTimer();
  }
}

/**
 * Timer with checkpoint support for multi-step operations
 */
export class CheckpointTimer {
  private startTime: number;
  private checkpoints = new Map<string, number>();
  private lastCheckpoint: number;

  constructor() {
    this.startTime = Date.now();
    this.lastCheckpoint = this.startTime;
  }

  /**
   * Record a checkpoint and return time since last checkpoint
   */
  checkpoint(name: string): number {
    const now = Date.now();
    const sinceLast = now - this.lastCheckpoint;
    this.checkpoints.set(name, sinceLast);
    this.lastCheckpoint = now;
    return sinceLast;
  }

  /**
   * Get total elapsed time
   */
  totalElapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get all checkpoints with their durations
   */
  getCheckpoints(): Record<string, number> {
    return Object.fromEntries(this.checkpoints);
  }

  /**
   * Get summary with total and breakdown
   */
  getSummary(): { totalMs: number; checkpoints: Record<string, number> } {
    return {
      totalMs: this.totalElapsed(),
      checkpoints: this.getCheckpoints(),
    };
  }
}

// Convenience exports
export const measureAsync = <T>(operation: () => Promise<T>): Promise<TimedResult<T>> =>
  OperationTimer.measure(operation);
export const measureSync = <T>(operation: () => T): TimedResult<T> =>
  OperationTimer.measureSync(operation);
export const startTimer = (): OperationTimer => OperationTimer.start();
