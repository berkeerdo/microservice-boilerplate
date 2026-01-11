/**
 * Example Queue Publisher
 * Demonstrates how to extend BasePublisher for domain-specific publishers
 *
 * Features Inherited from BasePublisher:
 * - Publisher confirms for guaranteed delivery
 * - Automatic retry with exponential backoff
 * - Circuit breaker for fault tolerance
 * - Proper message properties
 *
 * Usage:
 * - Publish events when something happens (e.g., after creating an entity)
 * - Other services can consume these events
 * - Enables event-driven architecture between microservices
 */
import { BasePublisher, type PublishResult } from './publishers/BasePublisher.js';
import type { QueueConnection } from './QueueConnection.js';

/**
 * Event payload types
 */
interface ExampleCreatedEvent {
  type: 'EXAMPLE_CREATED';
  payload: { id: number; name: string };
  timestamp: string;
}

interface ExampleUpdatedEvent {
  type: 'EXAMPLE_UPDATED';
  payload: { id: number; name: string };
  timestamp: string;
}

interface ExampleDeletedEvent {
  type: 'EXAMPLE_DELETED';
  payload: { id: number };
  timestamp: string;
}

type ExampleEvent = ExampleCreatedEvent | ExampleUpdatedEvent | ExampleDeletedEvent;

/**
 * ExamplePublisher - Publishes example events to the message queue
 *
 * @example
 * ```typescript
 * const publisher = new ExamplePublisher(queueConnection);
 * await publisher.initialize();
 *
 * // Publish with guaranteed delivery
 * const result = await publisher.publishExampleCreated({ id: 1, name: 'Test' });
 * if (!result.success) {
 *   console.error('Failed to publish:', result.error);
 * }
 * ```
 */
export class ExamplePublisher extends BasePublisher {
  constructor(queueConnection: QueueConnection, exchangeName = 'examples') {
    super(queueConnection, {
      exchangeName,
      exchangeType: 'topic',
      useConfirms: true,
      maxRetries: 3,
      initialRetryDelayMs: 100,
      maxRetryDelayMs: 5000,
      useCircuitBreaker: true,
    });
  }

  // ============================================
  // CONVENIENCE METHODS FOR SPECIFIC EVENTS
  // ============================================

  /**
   * Publish example.created event
   */
  async publishExampleCreated(
    data: { id: number; name: string },
    correlationId?: string
  ): Promise<PublishResult> {
    const event: ExampleCreatedEvent = {
      type: 'EXAMPLE_CREATED',
      payload: data,
      timestamp: new Date().toISOString(),
    };

    return this.publish<ExampleEvent>('example.created', event, { correlationId });
  }

  /**
   * Publish example.updated event
   */
  async publishExampleUpdated(
    data: { id: number; name: string },
    correlationId?: string
  ): Promise<PublishResult> {
    const event: ExampleUpdatedEvent = {
      type: 'EXAMPLE_UPDATED',
      payload: data,
      timestamp: new Date().toISOString(),
    };

    return this.publish<ExampleEvent>('example.updated', event, { correlationId });
  }

  /**
   * Publish example.deleted event
   */
  async publishExampleDeleted(
    data: { id: number },
    correlationId?: string
  ): Promise<PublishResult> {
    const event: ExampleDeletedEvent = {
      type: 'EXAMPLE_DELETED',
      payload: data,
      timestamp: new Date().toISOString(),
    };

    return this.publish<ExampleEvent>('example.deleted', event, { correlationId });
  }
}
