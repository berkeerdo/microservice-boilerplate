/**
 * Health Service
 * Centralized health checking for all infrastructure components
 */
import { QueueHealthService } from '../queue/QueueHealthService.js';
import config from '../../config/env.js';

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
  /**
   * Check database connectivity
   */
  checkDatabase(): ComponentHealth {
    // Placeholder - implement actual DB health check
    // Example with knex: await knex.raw('SELECT 1')
    return {
      status: 'not_configured',
      message: 'Database health check not implemented',
    };
  }

  /**
   * Check Redis connectivity
   */
  checkRedis(): ComponentHealth {
    if (!config.REDIS_ENABLED) {
      return { status: 'not_configured' };
    }

    // Placeholder - implement actual Redis health check
    // The existing connector handles this internally
    return {
      status: 'healthy',
      message: 'Redis configured (check via connector)',
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
   * Perform full health check
   */
  check(): HealthCheckResult {
    const database = this.checkDatabase();
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
  readiness(): { ready: boolean; checks: Record<string, boolean> } {
    const result = this.check();

    const checks: Record<string, boolean> = {};

    for (const [name, component] of Object.entries(result.components)) {
      if (component && component.status !== 'not_configured') {
        checks[name] = component.status === 'healthy';
      }
    }

    // Service is ready if no component is unhealthy
    const ready = result.status !== 'unhealthy';

    return { ready, checks };
  }
}

export const HealthService = new HealthServiceClass();
