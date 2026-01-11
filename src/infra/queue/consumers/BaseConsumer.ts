/**
 * Base Consumer for RabbitMQ
 * Industry-standard implementation with:
 * - Automatic retry with exponential backoff
 * - Dead Letter Queue (DLQ) handling
 * - Circuit breaker integration
 * - Message deduplication support
 * - Proper error handling and logging
 *
 * Best Practices Implemented:
 * 1. Each consumer gets its own channel
 * 2. Failed messages are retried with exponential backoff
 * 3. Messages exceeding max retries go to DLQ
 * 4. Circuit breaker prevents cascading failures
 * 5. Proper ack/nack handling
 */
import type { Channel, ConsumeMessage } from 'amqplib';
import type { QueueConnection } from '../QueueConnection.js';
import { CircuitBreaker, CircuitBreakerOpenError } from '../CircuitBreaker.js';
import logger from '../../logger/logger.js';

/** Default retry configuration */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 1000;
const DEFAULT_MAX_RETRY_DELAY_MS = 30000;

/** Header names for retry tracking */
const HEADER_RETRY_COUNT = 'x-retry-count';
const HEADER_ORIGINAL_EXCHANGE = 'x-original-exchange';
const HEADER_ORIGINAL_ROUTING_KEY = 'x-original-routing-key';
const HEADER_FIRST_FAILURE_TIME = 'x-first-failure-time';
const HEADER_LAST_ERROR = 'x-last-error';

export interface ConsumerOptions {
  /** Queue name to consume from */
  queueName: string;
  /** Exchange to bind to */
  exchangeName: string;
  /** Routing keys for binding */
  routingKeys: string[];
  /** Prefetch count (default: 10) */
  prefetch?: number;
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in ms (default: 1000) */
  initialRetryDelayMs?: number;
  /** Maximum retry delay in ms (default: 30000) */
  maxRetryDelayMs?: number;
  /** Whether to use circuit breaker (default: true) */
  useCircuitBreaker?: boolean;
  /** Circuit breaker failure threshold (default: 5) */
  circuitBreakerThreshold?: number;
  /** Exchange type (default: topic) */
  exchangeType?: 'direct' | 'topic' | 'fanout' | 'headers';
}

export interface MessageContext {
  /** Original message */
  message: ConsumeMessage;
  /** Routing key */
  routingKey: string;
  /** Message ID */
  messageId: string;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Current retry count */
  retryCount: number;
  /** Timestamp when message was received */
  receivedAt: Date;
}

/**
 * BaseConsumer - Abstract base class for RabbitMQ consumers
 * Extend this class and implement processMessage() for your specific use case
 */
export abstract class BaseConsumer {
  protected channel: Channel | null = null;
  protected isInitialized = false;
  protected isConsuming = false;
  protected consumerTag: string | null = null;
  protected circuitBreaker: CircuitBreaker | null = null;

  private readonly options: Required<
    Omit<ConsumerOptions, 'useCircuitBreaker' | 'circuitBreakerThreshold'>
  > & {
    useCircuitBreaker: boolean;
    circuitBreakerThreshold: number;
  };

  constructor(
    protected readonly queueConnection: QueueConnection,
    options: ConsumerOptions
  ) {
    this.options = {
      prefetch: 10,
      maxRetries: DEFAULT_MAX_RETRIES,
      initialRetryDelayMs: DEFAULT_INITIAL_RETRY_DELAY_MS,
      maxRetryDelayMs: DEFAULT_MAX_RETRY_DELAY_MS,
      useCircuitBreaker: true,
      circuitBreakerThreshold: 5,
      exchangeType: 'topic',
      ...options,
    };

    // Initialize circuit breaker if enabled
    if (this.options.useCircuitBreaker) {
      this.circuitBreaker = new CircuitBreaker({
        name: `consumer-${this.options.queueName}`,
        failureThreshold: this.options.circuitBreakerThreshold,
        resetTimeout: 30000,
        successThreshold: 3,
      });
    }
  }

  /**
   * Get DLQ name for this consumer
   */
  protected getDlqName(): string {
    return `${this.options.queueName}.dlq`;
  }

  /**
   * Get retry queue name for this consumer
   */
  protected getRetryQueueName(): string {
    return `${this.options.queueName}.retry`;
  }

  /**
   * Get DLX (Dead Letter Exchange) name
   */
  protected getDlxName(): string {
    return `${this.options.queueName}.dlx`;
  }

  /**
   * Initialize the consumer - setup queue, DLQ, and bindings
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create a dedicated channel for this consumer
      this.channel = await this.queueConnection.createChannel();

      // Set prefetch
      if (this.options.prefetch) {
        await this.channel.prefetch(this.options.prefetch);
      }

      // Assert the main exchange
      await this.channel.assertExchange(this.options.exchangeName, this.options.exchangeType, {
        durable: true,
      });

      // Assert DLX (Dead Letter Exchange)
      await this.channel.assertExchange(this.getDlxName(), 'direct', {
        durable: true,
      });

      // Assert DLQ (Dead Letter Queue) - messages that exceed max retries go here
      await this.channel.assertQueue(this.getDlqName(), {
        durable: true,
        autoDelete: false,
      });
      await this.channel.bindQueue(this.getDlqName(), this.getDlxName(), this.getDlqName());

      // Assert retry queue with TTL that routes back to main exchange
      // Messages wait here before being retried
      await this.channel.assertQueue(this.getRetryQueueName(), {
        durable: true,
        autoDelete: false,
        arguments: {
          'x-dead-letter-exchange': this.options.exchangeName,
          'x-message-ttl': this.options.initialRetryDelayMs,
        },
      });

      // Assert the main queue with DLQ configuration
      await this.channel.assertQueue(this.options.queueName, {
        durable: true,
        autoDelete: false,
        arguments: {
          'x-dead-letter-exchange': this.getDlxName(),
          'x-dead-letter-routing-key': this.getDlqName(),
        },
      });

      // Bind queue to exchange with routing keys
      for (const routingKey of this.options.routingKeys) {
        await this.channel.bindQueue(this.options.queueName, this.options.exchangeName, routingKey);
        logger.debug(
          {
            queue: this.options.queueName,
            exchange: this.options.exchangeName,
            routingKey,
          },
          'Queue bound to exchange'
        );
      }

      this.isInitialized = true;
      logger.info(
        {
          queue: this.options.queueName,
          exchange: this.options.exchangeName,
          routingKeys: this.options.routingKeys,
          maxRetries: this.options.maxRetries,
          dlq: this.getDlqName(),
        },
        'Consumer initialized'
      );
    } catch (error) {
      logger.error({ err: error, queue: this.options.queueName }, 'Failed to initialize consumer');
      throw error;
    }
  }

  /**
   * Start consuming messages
   */
  async startConsuming(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isConsuming || !this.channel) {
      return;
    }

    const result = await this.channel.consume(
      this.options.queueName,
      async (msg) => {
        if (!msg) {
          return;
        }
        await this.handleMessage(msg);
      },
      { noAck: false }
    );

    this.consumerTag = result.consumerTag;
    this.isConsuming = true;
    logger.info(
      { queue: this.options.queueName, consumerTag: this.consumerTag },
      'Consumer started'
    );
  }

  /**
   * Handle incoming message with retry logic and circuit breaker
   */
  private async handleMessage(msg: ConsumeMessage): Promise<void> {
    const startTime = Date.now();
    const routingKey = msg.fields.routingKey;
    const messageId = (msg.properties.messageId as string) || `auto-${Date.now()}`;
    const correlationId = msg.properties.correlationId as string | undefined;
    const retryCount = this.getRetryCount(msg);

    const context: MessageContext = {
      message: msg,
      routingKey,
      messageId,
      correlationId,
      retryCount,
      receivedAt: new Date(),
    };

    logger.debug(
      {
        queue: this.options.queueName,
        routingKey,
        messageId,
        correlationId,
        retryCount,
      },
      'Processing message'
    );

    try {
      // Parse message content
      const content = this.parseMessageContent(msg);

      // Execute with circuit breaker if enabled
      if (this.circuitBreaker) {
        await this.circuitBreaker.execute(async () => {
          await this.processMessage(content, context);
        });
      } else {
        await this.processMessage(content, context);
      }

      // Acknowledge message on success
      this.channel?.ack(msg);

      logger.debug(
        {
          queue: this.options.queueName,
          routingKey,
          messageId,
          durationMs: Date.now() - startTime,
        },
        'Message processed successfully'
      );
    } catch (error) {
      await this.handleMessageError(msg, error, context, startTime);
    }
  }

  /**
   * Parse message content safely
   */
  private parseMessageContent(msg: ConsumeMessage): unknown {
    const contentType = msg.properties.contentType as string | undefined;
    const content = msg.content.toString();

    if (contentType === 'application/json' || content.startsWith('{') || content.startsWith('[')) {
      try {
        return JSON.parse(content);
      } catch {
        // Return raw content if JSON parsing fails
        return content;
      }
    }

    return content;
  }

  /**
   * Handle message processing error
   */
  private async handleMessageError(
    msg: ConsumeMessage,
    error: unknown,
    context: MessageContext,
    startTime: number
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isCircuitBreakerOpen = error instanceof CircuitBreakerOpenError;

    logger.error(
      {
        err: error,
        queue: this.options.queueName,
        routingKey: context.routingKey,
        messageId: context.messageId,
        retryCount: context.retryCount,
        durationMs: Date.now() - startTime,
        isCircuitBreakerOpen,
      },
      'Failed to process message'
    );

    // If circuit breaker is open, requeue the message for later
    if (isCircuitBreakerOpen) {
      this.channel?.nack(msg, false, true); // Requeue
      return;
    }

    // Check if we should retry
    if (context.retryCount < this.options.maxRetries) {
      await this.scheduleRetry(msg, context.retryCount, errorMessage);
    } else {
      // Max retries exceeded - send to DLQ
      logger.warn(
        {
          queue: this.options.queueName,
          messageId: context.messageId,
          retryCount: context.retryCount,
          maxRetries: this.options.maxRetries,
        },
        'Message exceeded max retries, sending to DLQ'
      );
      this.channel?.nack(msg, false, false); // Don't requeue, let DLQ binding handle it
    }
  }

  /**
   * Schedule a message for retry
   */
  private async scheduleRetry(
    msg: ConsumeMessage,
    currentRetryCount: number,
    errorMessage: string
  ): Promise<void> {
    const newRetryCount = currentRetryCount + 1;
    const delay = this.calculateRetryDelay(newRetryCount);

    logger.info(
      {
        queue: this.options.queueName,
        messageId: msg.properties.messageId,
        currentRetry: currentRetryCount,
        nextRetry: newRetryCount,
        delayMs: delay,
      },
      'Scheduling message retry'
    );

    try {
      // Publish to retry queue with updated headers
      const headers = {
        ...(msg.properties.headers || {}),
        [HEADER_RETRY_COUNT]: newRetryCount,
        [HEADER_ORIGINAL_EXCHANGE]: msg.fields.exchange || this.options.exchangeName,
        [HEADER_ORIGINAL_ROUTING_KEY]: msg.fields.routingKey,
        [HEADER_FIRST_FAILURE_TIME]:
          (msg.properties.headers?.[HEADER_FIRST_FAILURE_TIME] as number) || Date.now(),
        [HEADER_LAST_ERROR]: errorMessage.substring(0, 500), // Limit error message size
      };

      // Create a temporary queue with the calculated delay TTL
      const tempRetryQueue = `${this.getRetryQueueName()}.${delay}`;
      await this.channel?.assertQueue(tempRetryQueue, {
        durable: true,
        autoDelete: true,
        expires: delay + 60000, // Queue expires after delay + 1 minute
        arguments: {
          'x-dead-letter-exchange': this.options.exchangeName,
          'x-dead-letter-routing-key': msg.fields.routingKey,
          'x-message-ttl': delay,
        },
      });

      // Publish to retry queue
      this.channel?.publish('', tempRetryQueue, msg.content, {
        ...msg.properties,
        headers,
        persistent: true,
      });

      // Acknowledge original message
      this.channel?.ack(msg);
    } catch (retryError) {
      logger.error(
        { err: retryError, queue: this.options.queueName },
        'Failed to schedule retry, sending to DLQ'
      );
      this.channel?.nack(msg, false, false);
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number): number {
    const delay = Math.min(
      this.options.initialRetryDelayMs * Math.pow(2, retryCount - 1),
      this.options.maxRetryDelayMs
    );
    // Add jitter (0-25%)
    const jitter = delay * Math.random() * 0.25;
    return Math.floor(delay + jitter);
  }

  /**
   * Get retry count from message headers
   */
  private getRetryCount(msg: ConsumeMessage): number {
    const headers = msg.properties.headers as Record<string, unknown> | undefined;
    if (!headers) {
      return 0;
    }
    const retryCount = headers[HEADER_RETRY_COUNT];
    return typeof retryCount === 'number' ? retryCount : 0;
  }

  /**
   * Process the message - to be implemented by subclasses
   * @param content - Parsed message content
   * @param context - Message context with metadata
   */
  protected abstract processMessage(content: unknown, context: MessageContext): Promise<void>;

  /**
   * Stop consuming messages
   */
  async stopConsuming(): Promise<void> {
    if (!this.isConsuming || !this.channel || !this.consumerTag) {
      return;
    }

    try {
      await this.channel.cancel(this.consumerTag);
      this.isConsuming = false;
      this.consumerTag = null;
      logger.info({ queue: this.options.queueName }, 'Consumer stopped');
    } catch (error) {
      logger.error({ err: error, queue: this.options.queueName }, 'Error stopping consumer');
    }
  }

  /**
   * Close the consumer and release resources
   */
  async close(): Promise<void> {
    await this.stopConsuming();

    if (this.channel) {
      try {
        await this.channel.close();
      } catch (error) {
        logger.debug({ err: error, queue: this.options.queueName }, 'Error closing channel');
      }
    }

    this.channel = null;
    this.isInitialized = false;
    logger.info({ queue: this.options.queueName }, 'Consumer closed');
  }

  /**
   * Get consumer stats
   */
  getStats(): {
    queueName: string;
    isConsuming: boolean;
    isInitialized: boolean;
    circuitBreakerState?: string;
  } {
    return {
      queueName: this.options.queueName,
      isConsuming: this.isConsuming,
      isInitialized: this.isInitialized,
      circuitBreakerState: this.circuitBreaker?.getState(),
    };
  }
}
