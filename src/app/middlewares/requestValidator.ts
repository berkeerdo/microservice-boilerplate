import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodSchema, ZodError } from 'zod';
import logger from '../../infra/logger/logger.js';

/**
 * Validation error response
 */
interface ValidationErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Format Zod error to readable format
 */
function formatZodError(error: ZodError): ValidationErrorResponse {
  return {
    statusCode: 400,
    error: 'Validation Error',
    message: 'Request validation failed',
    details: error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

/**
 * Create a pre-validation hook for Zod schemas
 */
export function createZodValidator<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      // Validate body
      if (request.body) {
        request.body = schema.parse(request.body);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn(
          { correlationId: request.correlationId, errors: error.issues },
          'Request validation failed'
        );
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  };
}

/**
 * Validate query parameters with Zod
 */
export function createQueryValidator<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      if (request.query) {
        request.query = schema.parse(request.query) as typeof request.query;
      }
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn(
          { correlationId: request.correlationId, errors: error.issues },
          'Query validation failed'
        );
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  };
}

/**
 * Validate URL parameters with Zod
 */
export function createParamsValidator<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      if (request.params) {
        request.params = schema.parse(request.params) as typeof request.params;
      }
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn(
          { correlationId: request.correlationId, errors: error.issues },
          'Params validation failed'
        );
        return reply.status(400).send(formatZodError(error));
      }
      throw error;
    }
  };
}

/**
 * Combined validator for body, query, and params
 */
interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function createValidator(schemas: ValidationSchemas) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const errors: ZodError[] = [];

    try {
      if (schemas.body && request.body) {
        request.body = schemas.body.parse(request.body);
      }
    } catch (error) {
      if (error instanceof ZodError) errors.push(error);
    }

    try {
      if (schemas.query && request.query) {
        request.query = schemas.query.parse(request.query) as typeof request.query;
      }
    } catch (error) {
      if (error instanceof ZodError) errors.push(error);
    }

    try {
      if (schemas.params && request.params) {
        request.params = schemas.params.parse(request.params) as typeof request.params;
      }
    } catch (error) {
      if (error instanceof ZodError) errors.push(error);
    }

    if (errors.length > 0) {
      const allIssues = errors.flatMap((e) => e.issues);
      const combinedError = new ZodError(allIssues);

      logger.warn(
        { correlationId: request.correlationId, errors: allIssues },
        'Request validation failed'
      );

      return reply.status(400).send(formatZodError(combinedError));
    }
  };
}

/**
 * Register global validation error handler
 */
export function registerValidationErrorHandler(fastify: FastifyInstance): void {
  fastify.setSchemaErrorFormatter((errors, dataVar) => {
    return new Error(errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).join(', '));
  });
}

// Common validation schemas
export const commonSchemas = {
  id: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),

  pagination: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional().default(1),
    limit: z.string().regex(/^\d+$/).transform(Number).optional().default(20),
  }),

  uuid: z.object({
    id: z.string().uuid(),
  }),
};
