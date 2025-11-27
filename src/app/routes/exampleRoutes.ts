import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { container } from '../../container.js';
import { TOKENS } from '../../container.js';
import {
  CreateExampleUseCase,
  GetExampleUseCase,
  ListExamplesUseCase,
  UpdateExampleUseCase,
  DeleteExampleUseCase,
} from '../../application/useCases/index.js';
import { createZodValidator } from '../middlewares/index.js';

/**
 * Request Schemas
 */
const createExampleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
});

const updateExampleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/* eslint-disable max-lines */
/**
 * Example Routes
 * CRUD operations for examples resource
 */
export function exampleRoutes(fastify: FastifyInstance): void {
  /**
   * GET /examples
   * List all examples with pagination
   */
  fastify.get('/', {
    schema: {
      tags: ['Examples'],
      summary: 'List all examples',
      description: 'Returns a paginated list of examples',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 20, description: 'Number of items per page' },
          offset: { type: 'integer', default: 0, description: 'Number of items to skip' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  name: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
          },
        },
      },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const query = listQuerySchema.parse(request.query);
      const useCase = container.resolve<ListExamplesUseCase>(TOKENS.ListExamplesUseCase);
      const result = await useCase.execute({
        limit: query.limit,
        offset: query.offset,
      });
      return reply.send(result);
    },
  });

  /**
   * GET /examples/:id
   * Get a single example by ID
   */
  fastify.get('/:id', {
    schema: {
      tags: ['Examples'],
      summary: 'Get example by ID',
      description: 'Returns a single example',
      params: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'Example ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.parse(request.params);
      const useCase = container.resolve<GetExampleUseCase>(TOKENS.GetExampleUseCase);
      const result = await useCase.execute({ id: params.id });

      if (!result) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: `Example with id ${params.id} not found`,
        });
      }

      return reply.send(result);
    },
  });

  /**
   * POST /examples
   * Create a new example
   */
  fastify.post('/', {
    schema: {
      tags: ['Examples'],
      summary: 'Create a new example',
      description: 'Creates a new example and returns it',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: createZodValidator(createExampleSchema),
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as z.infer<typeof createExampleSchema>;
      const useCase = container.resolve<CreateExampleUseCase>(TOKENS.CreateExampleUseCase);

      try {
        const result = await useCase.execute({ name: body.name });
        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
          return reply.status(400).send({
            error: 'DUPLICATE',
            message: error.message,
          });
        }
        throw error;
      }
    },
  });

  /**
   * PUT /examples/:id
   * Update an existing example
   */
  fastify.put('/:id', {
    schema: {
      tags: ['Examples'],
      summary: 'Update an example',
      description: 'Updates an existing example',
      params: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: createZodValidator(updateExampleSchema),
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.parse(request.params);
      const body = request.body as z.infer<typeof updateExampleSchema>;
      const useCase = container.resolve<UpdateExampleUseCase>(TOKENS.UpdateExampleUseCase);

      try {
        const result = await useCase.execute({ id: params.id, name: body.name });

        if (!result) {
          return reply.status(404).send({
            error: 'NOT_FOUND',
            message: `Example with id ${params.id} not found`,
          });
        }

        return reply.send(result);
      } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
          return reply.status(400).send({
            error: 'DUPLICATE',
            message: error.message,
          });
        }
        throw error;
      }
    },
  });

  /**
   * DELETE /examples/:id
   * Delete an example
   */
  fastify.delete('/:id', {
    schema: {
      tags: ['Examples'],
      summary: 'Delete an example',
      description: 'Deletes an example by ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            id: { type: 'integer' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamSchema.parse(request.params);
      const useCase = container.resolve<DeleteExampleUseCase>(TOKENS.DeleteExampleUseCase);
      const result = await useCase.execute({ id: params.id });

      if (!result.success) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: `Example with id ${params.id} not found`,
        });
      }

      return reply.send(result);
    },
  });
}
