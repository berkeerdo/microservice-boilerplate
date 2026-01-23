/**
 * Health Service
 * Centralized health checking for all infrastructure components
 * Uses db-bridge HealthChecker for database monitoring
 */
import { HealthService as QueueHealthService } from 'amqp-resilient';
import config from '../../config/env.js';
import { getDatabaseHealth, isDatabaseHealthy, getCacheStats } from '../db/database.js';
import { getRedisClient } from '../redis/redis.js';
import logger from '../logger/logger.js';

/**
 * Health check result for a single component
 */
export interface ComponentHealth {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'not_configured';
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Overall health check result
 */
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  components: {
    database?: ComponentHealth;
    redis?: ComponentHealth;
    queue?: ComponentHealth;
    cache?: ComponentHealth;
  };
}

// Health message constants
const MSG_CONNECTION_OK = 'Connection OK';

/**
 * Health Service - Checks all infrastructure components
 * Integrates with db-bridge HealthChecker for database monitoring
 */
class HealthServiceClass {
  /**
   * Check database connectivity using db-bridge HealthChecker
   */
  async checkDatabase(): Promise<ComponentHealth> {
    try {
      const healthResult = await getDatabaseHealth();

      if (!healthResult) {
        return {
          status: 'not_configured',
          message: 'Database not initialized',
        };
      }

      return {
        status: healthResult.status,
        latencyMs: healthResult.latency,
        message:
          healthResult.status === 'healthy' ? MSG_CONNECTION_OK : 'Health check detected issues',
        details: healthResult.details,
      };
    } catch (error) {
      logger.error({ err: error }, 'Database health check failed');
      return {
        status: 'unhealthy',
        message: (error as Error).message || 'Connection failed',
      };
    }
  }

  /**
   * Check database connectivity (sync - uses cached state from HealthChecker)
   */
  checkDatabaseSync(): ComponentHealth {
    const isHealthy = isDatabaseHealthy();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      message: isHealthy ? MSG_CONNECTION_OK : 'Database unhealthy',
    };
  }

  /**
   * Check Redis connectivity
   */
  async checkRedis(): Promise<ComponentHealth> {
    if (!config.REDIS_ENABLED) {
      return { status: 'not_configured' };
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        return {
          status: 'not_configured',
          message: 'Redis client not initialized',
        };
      }

      const start = Date.now();
      await redis.ping();
      const latencyMs = Date.now() - start;

      return {
        status: latencyMs > 100 ? 'degraded' : 'healthy',
        latencyMs,
        message: latencyMs > 100 ? 'High latency detected' : MSG_CONNECTION_OK,
      };
    } catch (error) {
      logger.error({ err: error }, 'Redis health check failed');
      return {
        status: 'unhealthy',
        message: (error as Error).message || 'Connection failed',
      };
    }
  }

  /**
   * Check cache statistics (db-bridge built-in cache)
   */
  checkCache(): ComponentHealth {
    try {
      const stats = getCacheStats();

      if (!stats) {
        return { status: 'not_configured' };
      }

      const hitRate = stats.hitRate ?? 0;

      return {
        status: hitRate < 0.5 ? 'degraded' : 'healthy',
        message: `Cache hit rate: ${(hitRate * 100).toFixed(1)}%`,
        details: {
          hits: stats.hits,
          misses: stats.misses,
          hitRate: hitRate,
          size: stats.size,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: (error as Error).message,
      };
    }
  }

  /**
   * Check RabbitMQ connectivity
   */
  checkQueue(): ComponentHealth {
    try {
      const overallStatus = QueueHealthService.getOverallStatus();
      const connections = QueueHealthService.getAllStatuses();

      if (overallStatus === 'not_configured') {
        return { status: 'not_configured' };
      }

      const statusMap: Record<string, ComponentHealth['status']> = {
        healthy: 'healthy',
        degraded: 'degraded',
        dead: 'unhealthy',
      };

      return {
        status: statusMap[overallStatus] || 'unhealthy',
        details: { connections },
      };
    } catch {
      return { status: 'not_configured' };
    }
  }

  /**
   * Perform full health check (async)
   */
  async checkAsync(): Promise<HealthCheckResult> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const cache = this.checkCache();
    const queue = this.checkQueue();

    // Determine overall status
    const components = { database, redis, queue, cache };
    const statuses = Object.values(components)
      .filter((c) => c.status !== 'not_configured')
      .map((c) => c.status);

    let overallStatus: HealthCheckResult['status'] = 'healthy';
    if (statuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: config.SERVICE_NAME,
      version: config.SERVICE_VERSION,
      uptime: process.uptime(),
      components,
    };
  }

  /**
   * Perform full health check (sync - uses cached states)
   */
  check(): HealthCheckResult {
    const database = this.checkDatabaseSync();
    const redis: ComponentHealth = config.REDIS_ENABLED
      ? { status: 'healthy', message: 'Use checkAsync() for accurate status' }
      : { status: 'not_configured' };
    const queue = this.checkQueue();
    const cache: ComponentHealth = {
      status: 'healthy',
      message: 'Use checkAsync() for accurate status',
    };

    // Determine overall status
    const components = { database, redis, queue, cache };
    const statuses = Object.values(components)
      .filter((c) => c.status !== 'not_configured')
      .map((c) => c.status);

    let overallStatus: HealthCheckResult['status'] = 'healthy';
    if (statuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: config.SERVICE_NAME,
      version: config.SERVICE_VERSION,
      uptime: process.uptime(),
      components,
    };
  }

  /**
   * Quick liveness check (just checks if process is running)
   */
  liveness(): { alive: boolean; uptime: number } {
    return {
      alive: true,
      uptime: process.uptime(),
    };
  }

  /**
   * Readiness check (can we accept traffic?)
   */
  async readiness(): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
    const result = await this.checkAsync();

    const checks: Record<string, boolean> = {};

    for (const [name, component] of Object.entries(result.components)) {
      if (component && component.status !== 'not_configured') {
        // For readiness, degraded is still acceptable
        checks[name] = component.status === 'healthy' || component.status === 'degraded';
      }
    }

    // Service is ready if no component is unhealthy
    const ready = result.status !== 'unhealthy';

    return { ready, checks };
  }
}

export const HealthService = new HealthServiceClass();
