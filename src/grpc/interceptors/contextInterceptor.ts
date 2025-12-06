/**
 * gRPC Context Interceptor
 *
 * Wraps gRPC handlers to extract metadata (like accept-language)
 * and set up RequestContext for the entire request lifecycle.
 *
 * This is the recommended pattern for Node.js gRPC servers since
 * @grpc/grpc-js doesn't support native server interceptors.
 *
 * Usage:
 *   const wrappedHandlers = wrapHandlersWithContext(originalHandlers);
 *   server.addService(Service.service, wrappedHandlers);
 */
import * as grpc from '@grpc/grpc-js';
import { RequestContext, type SupportedLocale } from '../../shared/context/index.js';
import logger from '../../infra/logger/logger.js';

// ============================================
// METADATA KEYS
// ============================================

/** Standard HTTP header for language preference */
const ACCEPT_LANGUAGE_KEY = 'accept-language';

/** Custom header for explicit language selection */
const X_LANGUAGE_KEY = 'x-language';

/** Trace ID for distributed tracing */
const X_TRACE_ID_KEY = 'x-trace-id';

// ============================================
// TYPES
// ============================================

/**
 * Base interface for gRPC calls with metadata
 * This provides type-safe access to metadata without needing specific request types
 */
interface GrpcCallWithMetadata {
  metadata: grpc.Metadata;
  request?: unknown;
}

/**
 * gRPC callback function type
 * Uses ServiceError for proper error handling
 */
type GrpcCallback = (error: grpc.ServiceError | null, response?: unknown) => void;

/**
 * Type-safe gRPC handler function
 */
type GrpcHandler = (call: GrpcCallWithMetadata, callback: GrpcCallback) => void | Promise<void>;

/**
 * Map of handler method names to their implementations
 */
type HandlerMap = Record<string, GrpcHandler>;

// ============================================
// METADATA EXTRACTION
// ============================================

/**
 * Extract locale from gRPC metadata
 * Priority: x-language > accept-language > default (tr)
 */
function extractLocaleFromMetadata(metadata: grpc.Metadata): SupportedLocale {
  // Check x-language first (explicit override)
  const xLanguage = metadata.get(X_LANGUAGE_KEY)[0];
  if (typeof xLanguage === 'string') {
    return RequestContext.parseLocale(xLanguage);
  }

  // Fall back to accept-language
  const acceptLanguage = metadata.get(ACCEPT_LANGUAGE_KEY)[0];
  if (typeof acceptLanguage === 'string') {
    return RequestContext.parseLocale(acceptLanguage);
  }

  return 'tr'; // Default
}

/**
 * Extract trace ID from metadata (for distributed tracing)
 */
function extractTraceId(metadata: grpc.Metadata): string | undefined {
  const traceId = metadata.get(X_TRACE_ID_KEY)[0];
  return typeof traceId === 'string' ? traceId : undefined;
}

// ============================================
// HANDLER WRAPPER
// ============================================

/**
 * Wrap a single handler with RequestContext
 */
function wrapHandler(methodName: string, handler: GrpcHandler): GrpcHandler {
  return (call, callback) => {
    const locale = extractLocaleFromMetadata(call.metadata);
    const traceId = extractTraceId(call.metadata);

    // Log incoming request with context
    logger.debug({ method: methodName, locale, traceId }, 'gRPC request received');

    // Run handler within RequestContext
    // Use .catch() to handle any uncaught promise rejections
    RequestContext.runAsync({ locale, traceId }, async () => {
      try {
        await handler(call, callback);
      } catch (error) {
        // This shouldn't happen if handlers properly use callbacks
        logger.error({ err: error, method: methodName }, 'Unhandled error in gRPC handler');
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    }).catch((error: unknown) => {
      // Handle any errors from RequestContext.runAsync itself
      logger.error({ err: error, method: methodName }, 'Fatal error in RequestContext');
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error',
      });
    });
  };
}

/**
 * Wrap all handlers in a handler map with RequestContext
 *
 * @example
 * const handlers = { GetData: getDataHandler };
 * const wrapped = wrapHandlersWithContext(handlers);
 * server.addService(MyService.service, wrapped);
 */
export function wrapHandlersWithContext<T extends HandlerMap>(handlers: T): T {
  const wrapped: HandlerMap = {};

  for (const [methodName, handler] of Object.entries(handlers)) {
    wrapped[methodName] = wrapHandler(methodName, handler);
  }

  return wrapped as T;
}

export default wrapHandlersWithContext;
