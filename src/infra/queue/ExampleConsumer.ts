/**
 * Example Queue Consumer
 * Demonstrates how to consume messages from RabbitMQ
 *
 * Message Flow:
 * 1. Other service publishes to exchange/queue
 * 2. This consumer receives the message
 * 3. Processes using Use Cases (same as HTTP/gRPC)
 * 4. Acknowledges or rejects the message
 */
import { ConsumeMessage } from 'amqplib';
import { QueueConnection } from './QueueConnection.js';
import { container } from '../../container.js';
import { TOKENS } from '../../container.js';
import { CreateExampleUseCase } from '../../application/useCases/index.js';
import logger from '../logger/logger.js';

/**
 * Message types for the example queue
 */
interface ExampleCreatedMessage {
  type: 'EXAMPLE_CREATED';
  payload: {
    name: string;
    correlationId?: string;
  };
}

interface ExampleUpdatedMessage {
  type: 'EXAMPLE_UPDATED';
  payload: {
    id: number;
    name: string;
    correlationId?: string;
  };
}

type QueueMessage = ExampleCreatedMessage | ExampleUpdatedMessage;

/**
 * ExampleConsumer - Consumes messages from the example queue
 */
export class ExampleConsumer {
  private connection: QueueConnection;
  private queueName: string;
  private isConsuming = false;
  private consumerTag: string | null = null;

  constructor(connection: QueueConnection, queueName: string) {
    this.connection = connection;
    this.queueName = queueName;
  }

  /**
   * Start consuming messages
   */
  async start(): Promise<void> {
    if (this.isConsuming) {
      logger.warn({ queue: this.queueName }, 'Consumer already started');
      return;
    }

    try {
      const channel = await this.connection.getChannel();

      // Assert queue exists (creates if not)
      await channel.assertQueue(this.queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': `${this.queueName}.dlx`,
          'x-dead-letter-routing-key': `${this.queueName}.dead`,
        },
      });

      // Setup dead letter queue (for failed messages)
      await channel.assertExchange(`${this.queueName}.dlx`, 'direct', { durable: true });
      await channel.assertQueue(`${this.queueName}.dead`, { durable: true });
      await channel.bindQueue(
        `${this.queueName}.dead`,
        `${this.queueName}.dlx`,
        `${this.queueName}.dead`
      );

      // Start consuming
      const result = await channel.consume(this.queueName, (msg) => this.handleMessage(msg), {
        noAck: false, // Manual acknowledgment
      });

      this.consumerTag = result.consumerTag;
      this.isConsuming = true;

      logger.info({ queue: this.queueName, consumerTag: this.consumerTag }, 'Consumer started');
    } catch (error) {
      logger.error({ err: error, queue: this.queueName }, 'Failed to start consumer');
      throw error;
    }
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg) {
      logger.warn('Received null message (consumer cancelled by server)');
      return;
    }

    const messageId = (msg.properties.messageId as string | undefined) || 'unknown';
    const correlationId = msg.properties.correlationId as string | undefined;

    logger.debug({ messageId, correlationId, queue: this.queueName }, 'Processing message');

    try {
      // Parse message
      const content = msg.content.toString();
      const message = JSON.parse(content) as QueueMessage;

      // Route to appropriate handler
      await this.processMessage(message, correlationId);

      // Acknowledge success
      const channel = await this.connection.getChannel();
      channel.ack(msg);

      logger.info(
        { messageId, type: message.type, correlationId },
        'Message processed successfully'
      );
    } catch (error) {
      logger.error({ err: error, messageId, correlationId }, 'Failed to process message');

      // Reject and send to dead letter queue
      const channel = await this.connection.getChannel();
      channel.nack(msg, false, false); // Don't requeue, send to DLQ
    }
  }

  /**
   * Route message to appropriate handler
   */
  private async processMessage(message: QueueMessage, correlationId?: string): Promise<void> {
    const childLogger = logger.child({ correlationId, messageType: message.type });

    switch (message.type) {
      case 'EXAMPLE_CREATED':
        await this.handleExampleCreated(message.payload, childLogger);
        break;

      case 'EXAMPLE_UPDATED':
        this.handleExampleUpdated(message.payload, childLogger);
        break;

      default:
        // @ts-expect-error - exhaustive check
        childLogger.warn({ type: message.type }, 'Unknown message type');
    }
  }

  /**
   * Handle EXAMPLE_CREATED message
   */
  private async handleExampleCreated(
    payload: ExampleCreatedMessage['payload'],
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
        return; // Don't throw - this is an expected scenario
      }
      throw error;
    }
  }

  /**
   * Handle EXAMPLE_UPDATED message
   */
  private handleExampleUpdated(
    payload: ExampleUpdatedMessage['payload'],
    log: typeof logger
  ): void {
    log.info({ id: payload.id, name: payload.name }, 'Processing EXAMPLE_UPDATED');

    // TODO: Implement using UpdateExampleUseCase
    // const useCase = container.resolve<UpdateExampleUseCase>(TOKENS.UpdateExampleUseCase);
    // await useCase.execute({ id: payload.id, name: payload.name });

    log.info('EXAMPLE_UPDATED handler not implemented yet');
  }

  /**
   * Stop consuming messages
   */
  async stop(): Promise<void> {
    if (!this.isConsuming || !this.consumerTag) {
      return;
    }

    try {
      const channel = await this.connection.getChannel();
      await channel.cancel(this.consumerTag);
      this.isConsuming = false;
      this.consumerTag = null;

      logger.info({ queue: this.queueName }, 'Consumer stopped');
    } catch (error) {
      logger.error({ err: error, queue: this.queueName }, 'Error stopping consumer');
    }
  }
}
