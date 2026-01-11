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

/** Client URL for email links (passed from frontend via gateway) */
const X_CLIENT_URL_KEY = 'x-client-url';

// ============================================
// TYPES
// ============================================

/**
 * gRPC call with metadata - minimal interface for extracting context
 * All gRPC call types (ServerUnaryCall, ServerReadableStream, etc.) have metadata
 */
interface GrpcCallWithMetadata {
  metadata: grpc.Metadata;
}

/**
 * Generic gRPC handler function
 * Uses grpc.UntypedHandleCall for proper type compatibility
 */
type GrpcHandler = grpc.UntypedHandleCall;

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

/**
 * Extract client URL from metadata (for email links)
 * Passed from frontend via gateway when making requests
 */
function extractClientUrl(metadata: grpc.Metadata): string | undefined {
  const clientUrl = metadata.get(X_CLIENT_URL_KEY)[0];
  if (typeof clientUrl === 'string' && clientUrl.startsWith('http')) {
    // Remove trailing slash for consistency
    return clientUrl.replace(/\/$/, '');
  }
  return undefined;
}

// ============================================
// HANDLER WRAPPER
// ============================================

/**
 * Wrap a single handler with RequestContext
 * Uses grpc.UntypedHandleCall for proper type compatibility
 */
function wrapHandler(methodName: string, handler: GrpcHandler): GrpcHandler {
  return (call: GrpcCallWithMetadata, callback?: grpc.sendUnaryData<unknown>) => {
    const locale = extractLocaleFromMetadata(call.metadata);
    const traceId = extractTraceId(call.metadata);
    const clientUrl = extractClientUrl(call.metadata);

    // Log incoming request with context
    logger.debug({ method: methodName, locale, traceId, clientUrl }, 'gRPC request received');

    // Run handler within RequestContext
    RequestContext.runAsync({ locale, traceId, clientUrl }, async () => {
      try {
        // Call original handler - cast to proper function type
        const originalHandler = handler as (
          call: GrpcCallWithMetadata,
          callback?: grpc.sendUnaryData<unknown>
        ) => void | Promise<void>;
        await originalHandler(call, callback);
      } catch (error) {
        // This shouldn't happen if handlers properly use callbacks
        logger.error({ err: error, method: methodName }, 'Unhandled error in gRPC handler');
        if (callback) {
          callback({
            code: grpc.status.INTERNAL,
            message: 'Internal server error',
            name: 'InternalError',
            details: 'Internal server error',
            metadata: new grpc.Metadata(),
          });
        }
      }
    }).catch((error: unknown) => {
      // Handle any errors from RequestContext.runAsync itself
      logger.error({ err: error, method: methodName }, 'Fatal error in RequestContext');
      if (callback) {
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
          name: 'InternalError',
          details: 'Internal server error',
          metadata: new grpc.Metadata(),
        });
      }
    });
  };
}

/**
 * Wrap all handlers in a service implementation with RequestContext
 * Uses grpc.UntypedServiceImplementation for proper type compatibility with addService()
 *
 * @example
 * const handlers = { GetData: getDataHandler };
 * const wrapped = wrapHandlersWithContext(handlers);
 * server.addService(MyService.service, wrapped);
 */
export function wrapHandlersWithContext(
  handlers: grpc.UntypedServiceImplementation
): grpc.UntypedServiceImplementation {
  const wrappedMap = new Map<string, grpc.UntypedHandleCall>();

  for (const [methodName, handler] of Object.entries(handlers)) {
    wrappedMap.set(methodName, wrapHandler(methodName, handler));
  }

  return Object.fromEntries(wrappedMap) as grpc.UntypedServiceImplementation;
}

export default wrapHandlersWithContext;
