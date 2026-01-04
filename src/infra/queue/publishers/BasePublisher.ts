/**
 * Base Publisher for RabbitMQ
 * Industry-standard implementation with:
 * - Publisher confirms for guaranteed delivery
 * - Automatic retry with exponential backoff
 * - Circuit breaker integration
 * - Proper message properties and headers
 * - Batch publishing support
 *
 * Best Practices Implemented:
 * 1. Always use publisher confirms for critical messages
 * 2. Implement retry logic for transient failures
 * 3. Use circuit breaker to prevent cascading failures
 * 4. Set persistent delivery mode for durable messages
 * 5. Include correlation IDs for tracing
 */
import type { ConfirmChannel, Channel } from 'amqplib';
import { randomUUID } from 'crypto';
import type { QueueConnection } from '../QueueConnection.js';
import { CircuitBreaker, CircuitBreakerOpenError } from '../CircuitBreaker.js';
import logger from '../../logger/logger.js';

/** Default retry configuration */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 100;
const DEFAULT_MAX_RETRY_DELAY_MS = 5000;

export interface PublisherOptions {
  /** Exchange name to publish to */
  exchangeName: string;
  /** Exchange type (default: topic) */
  exchangeType?: 'direct' | 'topic' | 'fanout' | 'headers';
  /** Whether to use publisher confirms (default: true) */
  useConfirms?: boolean;
  /** Maximum number of publish retries (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in ms (default: 100) */
  initialRetryDelayMs?: number;
  /** Maximum retry delay in ms (default: 5000) */
  maxRetryDelayMs?: number;
  /** Whether to use circuit breaker (default: true) */
  useCircuitBreaker?: boolean;
  /** Circuit breaker failure threshold (default: 5) */
  circuitBreakerThreshold?: number;
}

export interface PublishOptions {
  /** Correlation ID for message tracing */
  correlationId?: string;
  /** Message ID (auto-generated if not provided) */
  messageId?: string;
  /** Message priority (0-9, higher = more important) */
  priority?: number;
  /** Message expiration in milliseconds */
  expiration?: string;
  /** Custom headers */
  headers?: Record<string, unknown>;
  /** Whether message should be persistent (default: true) */
  persistent?: boolean;
  /** Reply-to queue for RPC patterns */
  replyTo?: string;
  /** Content type (default: application/json) */
  contentType?: string;
}

export interface PublishResult {
  /** Whether the publish was successful */
  success: boolean;
  /** Message ID */
  messageId: string;
  /** Correlation ID */
  correlationId: string;
  /** Number of retries needed */
  retries: number;
  /** Error if publish failed */
  error?: Error;
}

/**
 * BasePublisher - Base class for RabbitMQ publishers
 * Use this class directly or extend it for specific publishers
 */
export class BasePublisher {
  private channel: Channel | ConfirmChannel | null = null;
  private isInitialized = false;
  private circuitBreaker: CircuitBreaker | null = null;

  private readonly options: Required<
    Omit<PublisherOptions, 'useCircuitBreaker' | 'circuitBreakerThreshold'>
  > & {
    useCircuitBreaker: boolean;
    circuitBreakerThreshold: number;
  };

  constructor(
    protected readonly queueConnection: QueueConnection,
    options: PublisherOptions
  ) {
    this.options = {
      exchangeType: 'topic',
      useConfirms: true,
      maxRetries: DEFAULT_MAX_RETRIES,
      initialRetryDelayMs: DEFAULT_INITIAL_RETRY_DELAY_MS,
      maxRetryDelayMs: DEFAULT_MAX_RETRY_DELAY_MS,
      useCircuitBreaker: true,
      circuitBreakerThreshold: 5,
      ...options,
    };

    // Initialize circuit breaker if enabled
    if (this.options.useCircuitBreaker) {
      this.circuitBreaker = new CircuitBreaker({
        name: `publisher-${this.options.exchangeName}`,
        failureThreshold: this.options.circuitBreakerThreshold,
        resetTimeout: 30000,
        successThreshold: 3,
      });
    }
  }

  /**
   * Initialize the publisher - setup exchange
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Get appropriate channel type
      if (this.options.useConfirms) {
        this.channel = await this.queueConnection.getConfirmChannel();
      } else {
        this.channel = await this.queueConnection.getChannel();
      }

      // Assert the exchange
      await this.channel.assertExchange(this.options.exchangeName, this.options.exchangeType, {
        durable: true,
      });

      this.isInitialized = true;
      logger.info(
        {
          exchange: this.options.exchangeName,
          type: this.options.exchangeType,
          confirms: this.options.useConfirms,
        },
        'Publisher exchange initialized'
      );
    } catch (error) {
      logger.error(
        { err: error, exchange: this.options.exchangeName },
        'Failed to initialize publisher'
      );
      throw error;
    }
  }

  /**
   * Publish a message to the exchange
   * @param routingKey - Routing key for the message
   * @param message - Message payload (will be JSON stringified)
   * @param options - Publish options
   */
  async publish<T extends object>(
    routingKey: string,
    message: T,
    options: PublishOptions = {}
  ): Promise<PublishResult> {
    const messageId = options.messageId || randomUUID();
    const correlationId = options.correlationId || randomUUID();

    let retries = 0;
    let lastError: Error | undefined;

    while (retries <= this.options.maxRetries) {
      try {
        // Execute with circuit breaker if enabled
        if (this.circuitBreaker) {
          await this.circuitBreaker.execute(async () => {
            await this.doPublish(routingKey, message, {
              ...options,
              messageId,
              correlationId,
            });
          });
        } else {
          await this.doPublish(routingKey, message, {
            ...options,
            messageId,
            correlationId,
          });
        }

        if (retries > 0) {
          logger.info(
            {
              exchange: this.options.exchangeName,
              routingKey,
              messageId,
              retries,
            },
            'Message published after retry'
          );
        }

        return {
          success: true,
          messageId,
          correlationId,
          retries,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry if circuit breaker is open
        if (error instanceof CircuitBreakerOpenError) {
          logger.warn(
            {
              exchange: this.options.exchangeName,
              routingKey,
              messageId,
              remainingResetTime: error.remainingResetTime,
            },
            'Publish blocked by circuit breaker'
          );
          throw error;
        }

        retries++;
        if (retries <= this.options.maxRetries) {
          const delay = this.calculateRetryDelay(retries);
          logger.warn(
            {
              exchange: this.options.exchangeName,
              routingKey,
              messageId,
              retry: retries,
              maxRetries: this.options.maxRetries,
              delayMs: delay,
              error: lastError.message,
            },
            'Retrying publish after failure'
          );
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    logger.error(
      {
        exchange: this.options.exchangeName,
        routingKey,
        messageId,
        retries,
        error: lastError?.message,
      },
      'Failed to publish message after all retries'
    );

    return {
      success: false,
      messageId,
      correlationId,
      retries,
      error: lastError,
    };
  }

  /**
   * Publish a message and throw on failure (for critical messages)
   */
  async publishOrThrow<T extends object>(
    routingKey: string,
    message: T,
    options: PublishOptions = {}
  ): Promise<PublishResult> {
    const result = await this.publish(routingKey, message, options);
    if (!result.success) {
      throw result.error || new Error('Failed to publish message');
    }
    return result;
  }

  /**
   * Internal publish implementation
   */
  private async doPublish<T extends object>(
    routingKey: string,
    message: T,
    options: Required<Pick<PublishOptions, 'messageId' | 'correlationId'>> & PublishOptions
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.channel) {
      throw new Error('Publisher not initialized');
    }

    const content = Buffer.from(JSON.stringify(message));
    const publishOptions = {
      messageId: options.messageId,
      correlationId: options.correlationId,
      persistent: options.persistent ?? true,
      contentType: options.contentType ?? 'application/json',
      timestamp: Date.now(),
      priority: options.priority,
      expiration: options.expiration,
      replyTo: options.replyTo,
      headers: {
        ...options.headers,
        'x-published-at': new Date().toISOString(),
        'x-publisher': this.options.exchangeName,
      },
    };

    if (this.options.useConfirms) {
      // Use confirm channel for guaranteed delivery
      await new Promise<void>((resolve, reject) => {
        (this.channel as ConfirmChannel).publish(
          this.options.exchangeName,
          routingKey,
          content,
          publishOptions,
          (err) => {
            if (err) {
              reject(err instanceof Error ? err : new Error(String(err)));
            } else {
              resolve();
            }
          }
        );
      });
    } else {
      // Use regular channel (fire and forget with backpressure handling)
      const published = this.channel.publish(
        this.options.exchangeName,
        routingKey,
        content,
        publishOptions
      );

      if (!published) {
        // Channel buffer is full, wait for drain
        await new Promise<void>((resolve) => {
          this.channel?.once('drain', resolve);
        });
      }
    }

    logger.debug(
      {
        exchange: this.options.exchangeName,
        routingKey,
        messageId: options.messageId,
        correlationId: options.correlationId,
        confirms: this.options.useConfirms,
      },
      'Message published'
    );
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
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get publisher stats
   */
  getStats(): {
    exchangeName: string;
    isInitialized: boolean;
    useConfirms: boolean;
    circuitBreakerState?: string;
  } {
    return {
      exchangeName: this.options.exchangeName,
      isInitialized: this.isInitialized,
      useConfirms: this.options.useConfirms,
      circuitBreakerState: this.circuitBreaker?.getState(),
    };
  }

  /**
   * Reset circuit breaker (useful for testing or manual recovery)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker?.reset();
  }
}
