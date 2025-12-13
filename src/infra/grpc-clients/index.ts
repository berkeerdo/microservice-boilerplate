/**
 * gRPC Clients
 *
 * Resilient gRPC client infrastructure for inter-service communication.
 *
 * @example
 * ```typescript
 * import {
 *   ResilientGrpcClient,
 *   ConnectionState,
 *   type ClientHealth,
 * } from './infra/grpc-clients/index.js';
 *
 * class MyServiceClient extends ResilientGrpcClient<grpc.Client> {
 *   // ...
 * }
 * ```
 */

// Types
export {
  ConnectionState,
  DEFAULT_CONFIG,
  DEFAULT_METRICS,
  type ClientMetrics,
  type ClientHealth,
  type ResilientClientConfig,
  type CallOptions,
  type CacheEntry,
} from './types.js';

// Utilities
export { FallbackCache } from './FallbackCache.js';
export { MetricsTracker } from './MetricsTracker.js';

// Main class
export { ResilientGrpcClient } from './ResilientGrpcClient.js';
