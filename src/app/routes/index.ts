import { FastifyInstance } from 'fastify';
import { healthCheckHandler, readinessCheckHandler, rootHandler } from './handlers.js';
import { swaggerSchemas } from '../plugins/swagger.js';
import { exampleRoutes } from './exampleRoutes.js';

/**
 * Register all routes
 */
export function registerRoutes(fastify: FastifyInstance): void {
  // Root endpoint
  fastify.get('/', {
    schema: {
      tags: ['Health'],
      summary: 'Service information',
      response: {
        200: {
          type: 'object',
          properties: {
            service: { type: 'string' },
            version: { type: 'string' },
            docs: { type: 'string' },
            health: { type: 'string' },
            ready: { type: 'string' },
          },
        },
      },
    },
    handler: rootHandler,
  });

  // Health check endpoint (liveness)
  fastify.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Liveness probe',
      description: 'Returns service health status for load balancer / orchestrator',
      response: {
        200: swaggerSchemas.healthResponse,
        503: swaggerSchemas.healthResponse,
      },
    },
    handler: healthCheckHandler,
  });

  // Readiness check endpoint
  fastify.get('/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness probe',
      description: 'Returns whether the service is ready to accept traffic',
      response: {
        200: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            checks: {
              type: 'object',
              properties: {
                database: { type: 'boolean' },
                queue: { type: 'boolean' },
                cache: { type: 'boolean' },
              },
            },
          },
        },
        503: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            checks: { type: 'object' },
          },
        },
      },
    },
    handler: readinessCheckHandler,
  });

  // ============================================
  // API ROUTES
  // ============================================

  // Example CRUD API
  fastify.register(exampleRoutes, { prefix: '/api/v1/examples' });
}
