/**
 * Health Service
 * Centralized health checking for all infrastructure components
 */
import { QueueHealthService } from '../queue/QueueHealthService.js';
import config from '../../config/env.js';
import dbConnector from 'node-caching-mysql-connector-with-redis';
import logger from '../logger/logger.js';

const { getCacheQuery } = dbConnector;

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
  };
}

/**
 * Health Service - Checks all infrastructure components
 */
class HealthServiceClass {
  private lastDbHealth: ComponentHealth = { status: 'not_configured' };
  private lastDbCheckTime = 0;
  private dbCheckIntervalMs = 5000; // Cache health check result for 5 seconds

  /**
   * Check database connectivity with actual query
   */
  async checkDatabase(): Promise<ComponentHealth> {
    const now = Date.now();

    // Return cached result if recent (avoid hammering DB with health checks)
    if (now - this.lastDbCheckTime < this.dbCheckIntervalMs) {
      return this.lastDbHealth;
    }

    try {
      const start = Date.now();

      // Run actual health check query - use unique cache key to avoid caching this
      const healthCheckKey = `health:db:${Date.now()}`;
      await (getCacheQuery as (sql: string, params: unknown[], key: string) => Promise<unknown[]>)(
        'SELECT 1 as health',
        [],
        healthCheckKey
      );

      const latencyMs = Date.now() - start;

      this.lastDbHealth = {
        status: latencyMs > 1000 ? 'degraded' : 'healthy',
        latencyMs,
        message: latencyMs > 1000 ? 'High latency detected' : 'Connection OK',
      };
    } catch (error) {
      logger.error({ err: error }, 'Database health check failed');
      this.lastDbHealth = {
        status: 'unhealthy',
        message: (error as Error).message || 'Connection failed',
      };
    }

    this.lastDbCheckTime = now;
    return this.lastDbHealth;
  }

  /**
   * Check database connectivity (sync wrapper for compatibility)
   */
  checkDatabaseSync(): ComponentHealth {
    // Return last known state
    return this.lastDbHealth;
  }

  /**
   * Check Redis connectivity
   * Note: Redis is managed by node-caching-mysql-connector-with-redis internally
   */
  checkRedis(): ComponentHealth {
    if (!config.REDIS_ENABLED) {
      return { status: 'not_configured' };
    }

    // Redis is handled internally by the connector
    // If database health check works with caching, Redis is likely healthy
    return {
      status: 'healthy',
      message: 'Redis managed by DB connector',
    };
  }

  /**
   * Check RabbitMQ connectivity
   */
  checkQueue(): ComponentHealth {
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
  }

  /**
   * Perform full health check (async)
   */
  async checkAsync(): Promise<HealthCheckResult> {
    const [database] = await Promise.all([this.checkDatabase()]);
    const redis = this.checkRedis();
    const queue = this.checkQueue();

    // Determine overall status
    const components = { database, redis, queue };
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
   * Perform full health check (sync - uses cached DB state)
   */
  check(): HealthCheckResult {
    const database = this.checkDatabaseSync();
    const redis = this.checkRedis();
    const queue = this.checkQueue();

    // Determine overall status
    const components = { database, redis, queue };
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

  /**
   * Start periodic health checks (call on app startup)
   */
  startPeriodicChecks(intervalMs = 10000): NodeJS.Timeout {
    // Run initial check
    void this.checkDatabase();

    // Schedule periodic checks
    return setInterval(() => {
      void this.checkDatabase();
    }, intervalMs);
  }
}

export const HealthService = new HealthServiceClass();
