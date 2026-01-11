import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { FastifyJWTOptions } from '@fastify/jwt';
import fastifyJwt from '@fastify/jwt';
import config from '../../config/env.js';
import logger from '../../infra/logger/logger.js';

/**
 * JWT Payload interface - customize based on your needs
 */
export interface JwtPayload {
  sub: string; // User ID
  email?: string;
  roles?: string[];
  iat?: number;
  exp?: number;
}

/**
 * Extended FastifyRequest with user context
 */
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    userRoles?: string[];
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

/**
 * Register JWT authentication
 */
export async function registerJwtAuth(fastify: FastifyInstance): Promise<void> {
  if (!config.JWT_SECRET) {
    logger.warn('JWT_SECRET not configured, JWT auth disabled');
    return;
  }

  const jwtOptions: FastifyJWTOptions = {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN,
      iss: config.JWT_ISSUER,
    },
    verify: {
      allowedIss: config.JWT_ISSUER,
    },
  };
  await fastify.register(fastifyJwt, jwtOptions);

  // Add authenticate decorator
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const decoded = await request.jwtVerify<JwtPayload>();
      request.userId = decoded.sub;
      request.userRoles = decoded.roles || [];
    } catch (err) {
      logger.warn({ err, correlationId: request.correlationId }, 'JWT verification failed');
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }
  });

  // Add optional auth decorator (doesn't fail if no token)
  fastify.decorate('authenticateOptional', async (request: FastifyRequest) => {
    try {
      const decoded = await request.jwtVerify<JwtPayload>();
      request.userId = decoded.sub;
      request.userRoles = decoded.roles || [];
    } catch {
      // Silently ignore - user is not authenticated but that's OK
    }
  });

  logger.info('JWT authentication registered');
}

/**
 * Generate JWT token
 */
export function generateToken(fastify: FastifyInstance, payload: JwtPayload): string {
  return fastify.jwt.sign(payload);
}

/**
 * Role-based access control decorator factory
 */
export function requireRoles(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.userId) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const userRoles = request.userRoles || [];
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      logger.warn(
        { userId: request.userId, requiredRoles: roles, userRoles },
        'Access denied - insufficient roles'
      );
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    }
  };
}

// Type declaration for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateOptional: (request: FastifyRequest) => Promise<void>;
  }
}
