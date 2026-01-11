/**
 * RabbitMQ Queue Module
 *
 * Re-exports from amqp-resilient package with additional local extensions.
 *
 * @example
 * ```typescript
 * // Create connection
 * const connection = new ConnectionManager({
 *   host: 'localhost',
 *   connectionName: 'my-service',
 * });
 * await connection.connect();
 *
 * // Create publisher
 * const publisher = new BasePublisher(connection, {
 *   exchange: 'my-events',
 * });
 * await publisher.publish('event.created', { id: 1 });
 *
 * // Create consumer (extend BaseConsumer)
 * class MyConsumer extends BaseConsumer {
 *   protected async handle(content: unknown, context: MessageContext): Promise<void> {
 *     // Process message
 *   }
 * }
 * ```
 */

// Re-export everything from amqp-resilient package
export {
  // Connection
  ConnectionManager,
  type ConnectionOptions,
  ConnectionStatus,

  // Consumer
  BaseConsumer,
  type ConsumerOptions,
  type MessageContext,

  // Publisher
  BasePublisher,
  type PublisherOptions,
  type PublishOptions,
  type PublishResult,

  // Circuit Breaker
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitState,
  type CircuitBreakerOptions,

  // Health
  HealthService,

  // Logger interface
  type AmqpLogger,
  noopLogger,
} from 'amqp-resilient';

// Legacy exports (for backward compatibility - will be removed in future versions)
// These extend the base classes from amqp-resilient
export { ExampleConsumer } from './ExampleConsumer.js';
export { ExamplePublisher } from './ExamplePublisher.js';

// Backward compatibility aliases
export { ConnectionManager as QueueConnection } from 'amqp-resilient';
export { type ConnectionOptions as QueueConnectionOptions } from 'amqp-resilient';
export { HealthService as QueueHealthService } from 'amqp-resilient';
export { ConnectionStatus as QueueConnectionStatus } from 'amqp-resilient';
