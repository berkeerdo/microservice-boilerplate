import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { z } from 'zod';
import logger from '../../infra/logger/logger.js';

/**
 * Validation issue type from Zod error (Zod 4 compatible)
 */
type ValidationIssue = z.ZodError['issues'][number];

/**
 * Format Zod issues to readable response
 */
function formatValidationError(issues: ValidationIssue[]): {
  statusCode: number;
  error: string;
  message: string;
  details: { field: string; message: string }[];
} {
  return {
    statusCode: 400,
    error: 'Validation Error',
    message: 'Request validation failed',
    details: issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

/**
 * Create a Zod validation preHandler for request body
 * Uses safeParse (non-throwing) for cleaner error handling
 */
export function createZodValidator<T>(schema: z.ZodType<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.body) {
      return;
    }

    const result = schema.safeParse(request.body);

    if (!result.success) {
      logger.warn(
        { correlationId: request.correlationId, errors: result.error.issues },
        'Request validation failed'
      );
      return reply.status(400).send(formatValidationError(result.error.issues));
    }

    // Replace body with parsed/transformed data
    request.body = result.data;
  };
}

/**
 * Safe parse helper for params/query validation
 * Returns typed data or throws ValidationError
 */
export function safeParse<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    logger.warn({ context, errors: result.error.issues }, `${context} validation failed`);
    const error = new Error('Validation failed') as Error & {
      statusCode: number;
      validation: unknown;
    };
    error.statusCode = 400;
    error.validation = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw error;
  }

  return result.data;
}

/**
 * Register Fastify schema error formatter
 */
export function registerValidationErrorHandler(fastify: FastifyInstance): void {
  fastify.setSchemaErrorFormatter((errors, dataVar) => {
    return new Error(errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).join(', '));
  });
}
