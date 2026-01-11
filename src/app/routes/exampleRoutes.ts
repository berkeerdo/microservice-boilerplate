import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { container, TOKENS } from '../../container.js';
import type {
  CreateExampleUseCase,
  GetExampleUseCase,
  ListExamplesUseCase,
  UpdateExampleUseCase,
  DeleteExampleUseCase,
} from '../../application/useCases/index.js';
import { createZodValidator, safeParse } from '../middlewares/index.js';
import { exampleSchemas as S } from './schemas/exampleSchemas.js';

// Zod validation schemas
const createSchema = z.object({ name: z.string().min(1).max(100) });
const updateSchema = z.object({ name: z.string().min(1).max(100).optional() });
const idParam = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * Example CRUD Routes
 */
export function exampleRoutes(fastify: FastifyInstance): void {
  // GET /examples - List all
  fastify.get('/', {
    schema: {
      tags: ['Examples'],
      summary: 'List all examples',
      querystring: S.listQuery,
      response: { 200: S.exampleList },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const query = safeParse(listQuery, request.query, 'query');
      const useCase = container.resolve<ListExamplesUseCase>(TOKENS.ListExamplesUseCase);
      return reply.send(await useCase.execute(query));
    },
  });

  // GET /examples/:id - Get by ID
  fastify.get('/:id', {
    schema: {
      tags: ['Examples'],
      summary: 'Get example by ID',
      params: S.idParam,
      response: { 200: S.example, 404: S.error },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = safeParse(idParam, request.params, 'params');
      const useCase = container.resolve<GetExampleUseCase>(TOKENS.GetExampleUseCase);
      const result = await useCase.execute({ id });

      if (!result) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: `Example ${id} not found` });
      }
      return reply.send(result);
    },
  });

  // POST /examples - Create
  fastify.post('/', {
    schema: {
      tags: ['Examples'],
      summary: 'Create a new example',
      body: S.createBody,
      response: { 201: S.exampleCreated, 400: S.error },
    },
    preHandler: createZodValidator(createSchema),
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as z.infer<typeof createSchema>;
      const useCase = container.resolve<CreateExampleUseCase>(TOKENS.CreateExampleUseCase);

      try {
        const result = await useCase.execute({ name: body.name });
        return await reply.status(201).send(result);
      } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
          return reply.status(400).send({ error: 'DUPLICATE', message: error.message });
        }
        throw error;
      }
    },
  });

  // PUT /examples/:id - Update
  fastify.put('/:id', {
    schema: {
      tags: ['Examples'],
      summary: 'Update an example',
      params: S.idParam,
      body: S.updateBody,
      response: { 200: S.exampleUpdated, 404: S.error },
    },
    preHandler: createZodValidator(updateSchema),
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = safeParse(idParam, request.params, 'params');
      const body = request.body as z.infer<typeof updateSchema>;
      const useCase = container.resolve<UpdateExampleUseCase>(TOKENS.UpdateExampleUseCase);

      try {
        const result = await useCase.execute({ id, name: body.name });
        if (!result) {
          return await reply
            .status(404)
            .send({ error: 'NOT_FOUND', message: `Example ${id} not found` });
        }
        return await reply.send(result);
      } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
          return reply.status(400).send({ error: 'DUPLICATE', message: error.message });
        }
        throw error;
      }
    },
  });

  // DELETE /examples/:id – Delete
  fastify.delete('/:id', {
    schema: {
      tags: ['Examples'],
      summary: 'Delete an example',
      params: S.idParam,
      response: { 200: S.deleteSuccess, 404: S.error },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = safeParse(idParam, request.params, 'params');
      const useCase = container.resolve<DeleteExampleUseCase>(TOKENS.DeleteExampleUseCase);
      const result = await useCase.execute({ id });

      if (!result.success) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: `Example ${id} not found` });
      }
      return reply.send(result);
    },
  });
}
