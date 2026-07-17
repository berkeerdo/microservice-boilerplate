import type { FastifyRequest, FastifyReply } from 'fastify';
import { HealthService } from '../../infra/health/HealthService.js';
import config from '../../config/env.js';

/**
 * Health check handler—Liveness probe
 *
 * Deliberately checks ONLY the process itself, never dependencies:
 * a liveness probe that fails on a transient DB/Redis blip makes the
 * orchestrator restart perfectly healthy pods. Dependency status belongs
 * in the readiness probe (/ready), which gates traffic instead.
 */
export async function healthCheckHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const result = HealthService.liveness();
  await reply.status(200).send({
    status: 'alive',
    uptime: result.uptime,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Readiness check handler—Readiness probe
 * Returns whether the service is ready to accept traffic.
 *
 * Kubernetes' readiness probe:
 * - Returns 200 if service can accept requests—Returns 503 if service is not ready (for example, still initializing)
 */
export async function readinessCheckHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { ready, checks } = await HealthService.readiness();

  const response = {
    ready,
    checks,
    timestamp: new Date().toISOString(),
  };

  await reply.status(ready ? 200 : 503).send(response);
}

/**
 * Detailed health check handler
 * Returns comprehensive health information (use for debugging)
 */
export async function detailedHealthHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const result = await HealthService.checkAsync();

  // Add memory and CPU info
  const memoryUsage = process.memoryUsage();
  const detailedResult = {
    ...result,
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
      external: Math.round(memoryUsage.external / 1024 / 1024) + 'MB',
    },
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
    },
  };

  await reply.send(detailedResult);
}

/**
 * Root handler—Service info
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
