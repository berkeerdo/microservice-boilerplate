/**
 * Example Queue Publisher
 * Demonstrates how to publish messages to RabbitMQ
 *
 * Usage:
 * - Publish events when something happens (e.g., after creating an entity)
 * - Other services can consume these events
 * - Enables event-driven architecture between microservices
 */
import type { QueueConnection } from './QueueConnection.js';
import logger from '../logger/logger.js';
import { randomUUID } from 'crypto';

/**
 * Message types that can be published
 */
export interface PublishOptions {
  correlationId?: string;
  messageId?: string;
  persistent?: boolean;
  expiration?: string; // TTL in milliseconds as string
}

/**
 * ExamplePublisher - Publishes messages to RabbitMQ
 */
export class ExamplePublisher {
  private connection: QueueConnection;
  private exchangeName: string;
  private initialized = false;

  constructor(connection: QueueConnection, exchangeName = 'examples') {
    this.connection = connection;
    this.exchangeName = exchangeName;
  }

  /**
   * Initialize exchange (call once at startup)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const channel = await this.connection.getChannel();

    // Create exchange for broadcasting events
    await channel.assertExchange(this.exchangeName, 'topic', {
      durable: true,
    });

    this.initialized = true;
    logger.info({ exchange: this.exchangeName }, 'Publisher exchange initialized');
  }

  /**
   * Publish a message to the exchange
   */
  async publish<T extends object>(
    routingKey: string,
    message: T,
    options: PublishOptions = {}
  ): Promise<void> {
    const messageId = options.messageId || randomUUID();
    const correlationId = options.correlationId || randomUUID();

    try {
      const channel = await this.connection.getChannel();
      const content = Buffer.from(JSON.stringify(message));

      const published = channel.publish(this.exchangeName, routingKey, content, {
        messageId,
        correlationId,
        persistent: options.persistent ?? true,
        expiration: options.expiration,
        contentType: 'application/json',
        timestamp: Date.now(),
      });

      if (!published) {
        // Channel buffer is full, wait for drain
        await new Promise<void>((resolve) => channel.once('drain', resolve));
      }

      logger.debug(
        { messageId, correlationId, routingKey, exchange: this.exchangeName },
        'Message published'
      );
    } catch (error) {
      logger.error(
        { err: error, routingKey, exchange: this.exchangeName },
        'Failed to publish message'
      );
      throw error;
    }
  }

  /**
   * Publish with confirm (waits for broker acknowledgment)
   */
  async publishWithConfirm<T extends object>(
    routingKey: string,
    message: T,
    options: PublishOptions = {}
  ): Promise<void> {
    const messageId = options.messageId || randomUUID();
    const correlationId = options.correlationId || randomUUID();

    try {
      const channel = await this.connection.getConfirmChannel();
      const content = Buffer.from(JSON.stringify(message));

      await new Promise<void>((resolve, reject) => {
        channel.publish(
          this.exchangeName,
          routingKey,
          content,
          {
            messageId,
            correlationId,
            persistent: options.persistent ?? true,
            expiration: options.expiration,
            contentType: 'application/json',
            timestamp: Date.now(),
          },
          (err) => {
            if (err) {
              reject(err instanceof Error ? err : new Error(String(err)));
            } else {
              resolve();
            }
          }
        );
      });

      logger.debug(
        { messageId, correlationId, routingKey, exchange: this.exchangeName },
        'Message published with confirmation'
      );
    } catch (error) {
      logger.error(
        { err: error, routingKey, exchange: this.exchangeName },
        'Failed to publish message with confirmation'
      );
      throw error;
    }
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
  ): Promise<void> {
    await this.publish(
      'example.created',
      {
        type: 'EXAMPLE_CREATED',
        payload: data,
        timestamp: new Date().toISOString(),
      },
      { correlationId }
    );
  }

  /**
   * Publish example.updated event
   */
  async publishExampleUpdated(
    data: { id: number; name: string },
    correlationId?: string
  ): Promise<void> {
    await this.publish(
      'example.updated',
      {
        type: 'EXAMPLE_UPDATED',
        payload: data,
        timestamp: new Date().toISOString(),
      },
      { correlationId }
    );
  }

  /**
   * Publish example.deleted event
   */
  async publishExampleDeleted(data: { id: number }, correlationId?: string): Promise<void> {
    await this.publish(
      'example.deleted',
      {
        type: 'EXAMPLE_DELETED',
        payload: data,
        timestamp: new Date().toISOString(),
      },
      { correlationId }
    );
  }
}
