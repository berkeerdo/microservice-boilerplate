import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

/**
 * Correlation ID Header Names
 */
export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Extended FastifyRequest with correlation context
 */
declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
    requestId: string;
  }
}

/**
 * Register correlation ID middleware
 * - Extracts or generates correlation ID from incoming request
 * - Adds correlation ID to response headers
 * - Makes correlation ID available in request context
 */
export function registerCorrelationId(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done) => {
    // Get correlation ID from header or generate new one
    const correlationId =
      (request.headers[CORRELATION_ID_HEADER] as string) ||
      (request.headers[REQUEST_ID_HEADER] as string) ||
      randomUUID();

    // Generate unique request ID for this specific request
    const requestId = randomUUID();

    // Attach to request
    request.correlationId = correlationId;
    request.requestId = requestId;

    // Also set as Fastify's request ID
    request.id = requestId;

    // Add to response headers
    void reply.header(CORRELATION_ID_HEADER, correlationId);
    void reply.header(REQUEST_ID_HEADER, requestId);

    done();
  });

  // Add correlation context to logger
  fastify.addHook('preHandler', (request: FastifyRequest, _reply: FastifyReply, done) => {
    // Extend request log with correlation context
    request.log = request.log.child({
      correlationId: request.correlationId,
      requestId: request.requestId,
    });
    done();
  });
}

/**
 * Get correlation ID from request
 * Utility function for use in handlers
 */
export function getCorrelationId(request: FastifyRequest): string {
  return request.correlationId;
}

/**
 * Get request ID from request
 */
export function getRequestId(request: FastifyRequest): string {
  return request.requestId;
}
