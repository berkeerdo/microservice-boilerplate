/**
 * Example Queue Consumer
 * Demonstrates how to extend BaseConsumer for domain-specific consumers
 *
 * Features Inherited from BaseConsumer:
 * - Automatic retry with exponential backoff
 * - Dead Letter Queue (DLQ) handling
 * - Circuit breaker for fault tolerance
 * - Proper ack/nack handling
 *
 * Message Flow:
 * 1. Other service publishes to exchange
 * 2. This consumer receives the message
 * 3. Processes using Use Cases (same as HTTP/gRPC)
 * 4. Acknowledges or rejects (with retry/DLQ)
 */
import { container, TOKENS } from '../../container.js';
import type { CreateExampleUseCase } from '../../application/useCases/index.js';
import { BaseConsumer, type MessageContext } from './consumers/BaseConsumer.js';
import type { QueueConnection } from './QueueConnection.js';
import logger from '../logger/logger.js';

/**
 * Message types for the example queue
 */
interface ExampleCreatedPayload {
  type: 'created';
  name: string;
}

interface ExampleUpdatedPayload {
  type: 'updated';
  id: number;
  name: string;
}

interface ExampleDeletedPayload {
  id: number;
}

interface ExampleMessage {
  type: 'EXAMPLE_CREATED' | 'EXAMPLE_UPDATED' | 'EXAMPLE_DELETED';
  payload: ExampleCreatedPayload | ExampleUpdatedPayload | ExampleDeletedPayload;
  timestamp: string;
}

/**
 * ExampleConsumer - Consumes example events from the message queue
 *
 * @example
 * ```typescript
 * const consumer = new ExampleConsumer(queueConnection, 'examples');
 * await consumer.initialize();
 * await consumer.startConsuming();
 * ```
 */
export class ExampleConsumer extends BaseConsumer {
  constructor(queueConnection: QueueConnection, exchangeName = 'examples') {
    super(queueConnection, {
      queueName: 'example-events',
      exchangeName,
      routingKeys: ['example.created', 'example.updated', 'example.deleted', 'example.#'],
      prefetch: 10,
      maxRetries: 3,
      initialRetryDelayMs: 1000,
      maxRetryDelayMs: 30000,
      useCircuitBreaker: true,
    });
  }

  /**
   * Process incoming message - routes to appropriate handler
   */
  protected async processMessage(content: unknown, context: MessageContext): Promise<void> {
    const message = content as ExampleMessage;

    const childLogger = logger.child({
      correlationId: context.correlationId,
      messageId: context.messageId,
      messageType: message.type,
      retryCount: context.retryCount,
    });

    switch (message.type) {
      case 'EXAMPLE_CREATED':
        await this.handleExampleCreated(message.payload as ExampleCreatedPayload, childLogger);
        break;

      case 'EXAMPLE_UPDATED':
        this.handleExampleUpdated(message.payload as ExampleUpdatedPayload, childLogger);
        break;

      case 'EXAMPLE_DELETED':
        this.handleExampleDeleted(message.payload as ExampleDeletedPayload, childLogger);
        break;

      default:
        childLogger.warn({ type: (message as { type: string }).type }, 'Unknown message type');
    }
  }

  /**
   * Handle EXAMPLE_CREATED message
   */
  private async handleExampleCreated(
    payload: ExampleCreatedPayload,
    log: typeof logger
  ): Promise<void> {
    log.info({ name: payload.name }, 'Processing EXAMPLE_CREATED');

    // Use the same use case as HTTP/gRPC - Clean Architecture!
    const useCase = container.resolve<CreateExampleUseCase>(TOKENS.CreateExampleUseCase);

    try {
      const result = await useCase.execute({ name: payload.name });
      log.info({ id: result.id, name: result.name }, 'Example created from queue message');
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        log.warn({ name: payload.name }, 'Example already exists, skipping');
        return; // Don't throw - this is idempotent
      }
      throw error; // Rethrow for retry
    }
  }

  /**
   * Handle EXAMPLE_UPDATED message
   */
  private handleExampleUpdated(payload: ExampleUpdatedPayload, log: typeof logger): void {
    log.info({ id: payload.id, name: payload.name }, 'Processing EXAMPLE_UPDATED');

    // TODO: Implement using UpdateExampleUseCase
    // const useCase = container.resolve<UpdateExampleUseCase>(TOKENS.UpdateExampleUseCase);
    // await useCase.execute({ id: payload.id, name: payload.name });

    log.info('EXAMPLE_UPDATED handler not implemented yet');
  }

  /**
   * Handle EXAMPLE_DELETED message
   */
  private handleExampleDeleted(payload: ExampleDeletedPayload, log: typeof logger): void {
    log.info({ id: payload.id }, 'Processing EXAMPLE_DELETED');

    // TODO: Implement using DeleteExampleUseCase
    // const useCase = container.resolve<DeleteExampleUseCase>(TOKENS.DeleteExampleUseCase);
    // await useCase.execute({ id: payload.id });

    log.info('EXAMPLE_DELETED handler not implemented yet');
  }
}
