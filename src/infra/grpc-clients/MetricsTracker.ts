/**
 * Metrics Tracker
 *
 * Tracks gRPC client metrics for monitoring and OpenTelemetry integration.
 */
import type { ClientMetrics } from './types.js';
import { DEFAULT_METRICS } from './types.js';

export class MetricsTracker {
  private metrics: ClientMetrics;
  private latencySum = 0;

  constructor() {
    this.metrics = { ...DEFAULT_METRICS, lastResetAt: new Date() };
  }

  /**
   * Record a call start
   */
  recordCallStart(): void {
    this.metrics.totalCalls++;
  }

  /**
   * Record a successful call with latency
   */
  recordSuccess(latencyMs: number): void {
    this.metrics.successfulCalls++;
    this.updateLatency(latencyMs);
  }

  /**
   * Record a failed call
   */
  recordFailure(): void {
    this.metrics.failedCalls++;
  }

  /**
   * Record a retry attempt
   */
  recordRetry(): void {
    this.metrics.totalRetries++;
  }

  /**
   * Record a circuit breaker trip
   */
  recordCircuitBreakerTrip(): void {
    this.metrics.circuitBreakerTrips++;
  }

  /**
   * Record a cache hit
   */
  recordCacheHit(): void {
    this.metrics.cacheHits++;
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
  }

  /**
   * Update latency metrics
   */
  private updateLatency(latencyMs: number): void {
    this.latencySum += latencyMs;

    if (latencyMs > this.metrics.maxLatencyMs) {
      this.metrics.maxLatencyMs = latencyMs;
    }
    if (latencyMs < this.metrics.minLatencyMs) {
      this.metrics.minLatencyMs = latencyMs;
    }

    // Calculate average
    this.metrics.avgLatencyMs = Math.round(this.latencySum / this.metrics.successfulCalls);
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): ClientMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = { ...DEFAULT_METRICS, lastResetAt: new Date() };
    this.latencySum = 0;
  }

  /**
   * Get success rate (0-100)
   */
  getSuccessRate(): number {
    if (this.metrics.totalCalls === 0) {
      return 100;
    }
    return Math.round((this.metrics.successfulCalls / this.metrics.totalCalls) * 100);
  }

  /**
   * Get cache hit rate (0-100)
   */
  getCacheHitRate(): number {
    const totalCacheAccess = this.metrics.cacheHits + this.metrics.cacheMisses;
    if (totalCacheAccess === 0) {
      return 0;
    }
    return Math.round((this.metrics.cacheHits / totalCacheAccess) * 100);
  }
}

export default MetricsTracker;
