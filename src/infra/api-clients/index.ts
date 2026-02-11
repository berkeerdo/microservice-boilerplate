/**
 * External API Clients
 *
 * Base classes and utilities for building external API clients.
 * Extend BaseAPIClient to create service-specific clients.
 */

// Base class for API clients
export { BaseAPIClient, type APIClientResponse } from './BaseAPIClient.js';

// Circuit breaker for API clients
export {
  APICircuitBreaker,
  CircuitBreakerOpenError,
  type APICircuitBreakerConfig,
  type CircuitState,
} from './APICircuitBreaker.js';
