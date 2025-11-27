import { FastifyRequest, FastifyReply } from 'fastify';
import { QueueHealthService } from '../../infra/queue/QueueHealthService.js';
import config from '../../config/env.js';

/**
 * Health check response interface
 */
interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'dead';
  service: string;
  version: string;
  timestamp: string;
  uptime: number;
  checks?: {
    queue?: {
      status: string;
      connections: Record<string, string>;
    };
  };
}

/**
 * Readiness check response
 */
interface ReadinessResponse {
  ready: boolean;
  checks: {
    database?: boolean;
    queue?: boolean;
    cache?: boolean;
  };
}

/**
 * Health check handler - Liveness probe
 * Returns service status for load balancer / orchestrator
 */
export async function healthCheckHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const queueOverallStatus = QueueHealthService.getOverallStatus();
  const queueStatuses = QueueHealthService.getAllStatuses();

  let status: 'ok' | 'degraded' | 'dead' = 'ok';

  if (queueOverallStatus === 'dead') {
    status = 'dead';
  } else if (queueOverallStatus === 'degraded') {
    status = 'degraded';
  }

  const response: HealthCheckResponse = {
    status,
    service: config.SERVICE_NAME,
    version: config.SERVICE_VERSION,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  // Only include queue info if configured
  if (Object.keys(queueStatuses).length > 0) {
    response.checks = {
      queue: {
        status: queueOverallStatus,
        connections: queueStatuses,
      },
    };
  }

  const httpStatus = status === 'dead' ? 503 : 200;
  await reply.status(httpStatus).send(response);
}

/**
 * Readiness check handler - Readiness probe
 * Returns whether the service is ready to accept traffic
 */
export async function readinessCheckHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const checks: ReadinessResponse['checks'] = {};
  let ready = true;

  // Check queue health
  const queueStatus = QueueHealthService.getOverallStatus();
  if (queueStatus !== 'not_configured') {
    checks.queue = queueStatus === 'healthy';
    if (!checks.queue) ready = false;
  }

  // Add more readiness checks as needed:
  // - Database connection
  // - Cache connection
  // - External service dependencies

  const response: ReadinessResponse = {
    ready,
    checks,
  };

  await reply.status(ready ? 200 : 503).send(response);
}

/**
 * Root handler - Service info
 */
export async function rootHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await reply.send({
    service: config.SERVICE_NAME,
    version: config.SERVICE_VERSION,
    docs: config.NODE_ENV !== 'production' ? '/docs' : undefined,
    health: '/health',
    ready: '/ready',
  });
}
