/**
 * RabbitMQ Queue Module
 *
 * Industry-standard RabbitMQ implementation with:
 * - QueueConnection: Connection management with auto-reconnect
 * - BaseConsumer: Consumer with retry logic, DLQ, and circuit breaker
 * - BasePublisher: Publisher with confirms, retry, and circuit breaker
 * - CircuitBreaker: Fault tolerance pattern
 * - QueueHealthService: Health monitoring
 *
 * @example
 * ```typescript
 * // Create connection
 * const connection = new QueueConnection({
 *   host: 'localhost',
 *   connectionName: 'my-service',
 * });
 * await connection.connect();
 *
 * // Create publisher
 * const publisher = new BasePublisher(connection, {
 *   exchangeName: 'my-events',
 * });
 * await publisher.publish('event.created', { id: 1 });
 *
 * // Create consumer (extend BaseConsumer)
 * class MyConsumer extends BaseConsumer {
 *   protected async processMessage(content: unknown, context: MessageContext): Promise<void> {
 *     // Process message
 *   }
 * }
 * ```
 */

// Core
export { QueueConnection, type QueueConnectionOptions } from './QueueConnection.js';
export { QueueHealthService, QueueConnectionStatus } from './QueueHealthService.js';

// Circuit Breaker
export {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitState,
  type CircuitBreakerOptions,
} from './CircuitBreaker.js';

// Consumers
export { BaseConsumer, type ConsumerOptions, type MessageContext } from './consumers/index.js';

// Publishers
export {
  BasePublisher,
  type PublisherOptions,
  type PublishOptions,
  type PublishResult,
} from './publishers/index.js';

// Legacy exports (for backward compatibility - will be removed in future versions)
export { ExampleConsumer } from './ExampleConsumer.js';
export { ExamplePublisher } from './ExamplePublisher.js';
