/**
 * Request Context Middleware
 *
 * Sets up RequestContext for HTTP requests with:
 * - Locale from Accept-Language header
 * - Trace ID for distributed tracing
 * - Client URL for email links
 *
 * This ensures i18n and context work consistently across HTTP and gRPC.
 *
 * @example
 * // In server.ts
 * import { registerRequestContext } from './middlewares/requestContext.js';
 * registerRequestContext(fastify);
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RequestContext } from '../../shared/context/RequestContext.js';

/**
 * Header names for context extraction
 */
const ACCEPT_LANGUAGE_HEADER = 'accept-language';
const X_LOCALE_HEADER = 'x-locale';
const X_TRACE_ID_HEADER = 'x-trace-id';
const X_CLIENT_URL_HEADER = 'x-client-url';

/**
 * Extended FastifyRequest with locale
 */
declare module 'fastify' {
  interface FastifyRequest {
    locale: 'tr' | 'en';
  }
}

/**
 * Register request context middleware
 *
 * Wraps all HTTP requests with RequestContext for:
 * - i18n support via Accept-Language or x-locale header
 * - Distributed tracing via x-trace-id header
 * - Client URL for email links via x-client-url header
 */
export function registerRequestContext(fastify: FastifyInstance): void {
  // Use onRequest to set up context as early as possible
  fastify.addHook('onRequest', (request: FastifyRequest, _reply: FastifyReply, done) => {
    // Extract locale from headers (x-locale takes priority over Accept-Language)
    const localeHeader =
      (request.headers[X_LOCALE_HEADER] as string) || request.headers[ACCEPT_LANGUAGE_HEADER]!;

    const locale = RequestContext.parseLocale(localeHeader);

    // Extract trace ID (from gateway or generate)
    const traceId = (request.headers[X_TRACE_ID_HEADER] as string) || request.id;

    // Extract client URL for email links
    const clientUrl = request.headers[X_CLIENT_URL_HEADER] as string | undefined;

    // Attach locale to request for easy access
    request.locale = locale;

    // Set up RequestContext for this request
    // Note: We need to use enterWith for Fastify hooks since they don't support async wrapping
    const contextData = { locale, traceId, clientUrl };

    // Store context data on request for later use in error handler
    (request as FastifyRequest & { contextData: typeof contextData }).contextData = contextData;

    done();
  });

  // Wrap route handlers with RequestContext
  fastify.addHook('preHandler', (request: FastifyRequest, reply: FastifyReply, done) => {
    const contextData = (request as FastifyRequest & { contextData?: object }).contextData || {
      locale: 'tr' as const,
      traceId: request.id,
    };

    // Run the rest of the request within RequestContext
    RequestContext.run(contextData, () => {
      done();
    });
  });
}

/**
 * Get locale from request
 * Utility function for use in handlers
 */
export function getRequestLocale(request: FastifyRequest): 'tr' | 'en' {
  return request.locale || 'tr';
}
