/**
 * RabbitMQ Connection Manager
 * Industry-standard implementation with:
 * - Automatic reconnection with exponential backoff and jitter
 * - Connection heartbeat for health monitoring
 * - Dedicated channels for consumers (one channel per consumer)
 * - Confirm channels for publishers (guaranteed delivery)
 * - Graceful shutdown handling
 *
 * Best Practices Implemented:
 * 1. Use separate channels for publishing and consuming
 * 2. Never share channels between consumers
 * 3. Use confirm channels for critical messages
 * 4. Implement proper error handling and reconnection
 * 5. Use heartbeats to detect dead connections
 */
import amqplib from 'amqplib';
import type { Channel, ConfirmChannel, Options } from 'amqplib';
import logger from '../logger/logger.js';
import { QueueHealthService, QueueConnectionStatus } from './QueueHealthService.js';

/** Initial reconnection delay in milliseconds */
const INITIAL_RECONNECT_DELAY_MS = 1000;
/** Maximum reconnection delay in milliseconds */
const MAX_RECONNECT_DELAY_MS = 60000;
/** Maximum number of reconnection attempts (0 = unlimited) */
const MAX_RECONNECT_ATTEMPTS = 0;
/** Connection heartbeat in seconds */
const HEARTBEAT_SECONDS = 60;

export interface QueueConnectionOptions {
  /** Full AMQP URL (alternative to individual params) */
  url?: string;
  /** RabbitMQ host */
  host?: string;
  /** RabbitMQ port (default: 5672) */
  port?: number;
  /** RabbitMQ username */
  username?: string;
  /** RabbitMQ password */
  password?: string;
  /** RabbitMQ virtual host (default: /) */
  vhost?: string;
  /** Connection name for identification (default: default) */
  connectionName?: string;
  /** Prefetch count for consumers (default: 10) */
  prefetch?: number;
  /** Connection heartbeat in seconds (default: 60) */
  heartbeat?: number;
  /** Maximum reconnection attempts (0 = unlimited, default: 0) */
  maxReconnectAttempts?: number;
}

// amqplib connection type
type AmqpConnection = Awaited<ReturnType<typeof amqplib.connect>>;

/**
 * QueueConnection - Manages RabbitMQ connection with auto-reconnect
 * Use one instance per logical connection purpose (e.g., one for events, one for tasks)
 */
export class QueueConnection {
  private connection: AmqpConnection | null = null;
  private sharedChannel: Channel | null = null;
  private confirmChannel: ConfirmChannel | null = null;
  private reconnectAttempts = 0;
  private isShuttingDown = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly connectionUrl: string;
  private readonly connectionName: string;
  private readonly prefetch: number;
  private readonly heartbeat: number;
  private readonly maxReconnectAttempts: number;
  private readonly createdChannels = new Set<Channel>();

  constructor(options: QueueConnectionOptions) {
    this.connectionName = options.connectionName ?? 'default';
    this.prefetch = options.prefetch ?? 10;
    this.heartbeat = options.heartbeat ?? HEARTBEAT_SECONDS;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? MAX_RECONNECT_ATTEMPTS;

    // Build connection URL from individual params or use provided URL
    if (options.url) {
      this.connectionUrl = options.url;
    } else if (options.host) {
      const username = encodeURIComponent(options.username ?? 'guest');
      const password = encodeURIComponent(options.password ?? 'guest');
      const host = options.host;
      const port = options.port ?? 5672;
      const vhost = encodeURIComponent(options.vhost ?? '/');
      this.connectionUrl = `amqp://${username}:${password}@${host}:${port}/${vhost}`;
    } else {
      throw new Error('QueueConnection requires either url or host parameter');
    }
  }

  /**
   * Connect to RabbitMQ
   */
  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    QueueHealthService.registerStatus(this.connectionName, QueueConnectionStatus.CONNECTING);

    try {
      logger.info({ connectionName: this.connectionName }, 'Connecting to RabbitMQ...');

      // Connection options with heartbeat
      const socketOptions: Options.Connect = {
        heartbeat: this.heartbeat,
      };

      this.connection = await amqplib.connect(this.connectionUrl, socketOptions);
      this.reconnectAttempts = 0;

      // Setup connection event handlers
      this.connection.on('error', (err: Error) => {
        logger.error({ err, connectionName: this.connectionName }, 'RabbitMQ connection error');
      });

      this.connection.on('close', () => {
        if (!this.isShuttingDown) {
          logger.warn(
            { connectionName: this.connectionName },
            'RabbitMQ connection closed unexpectedly, scheduling reconnect...'
          );
          this.connection = null;
          this.sharedChannel = null;
          this.confirmChannel = null;
          this.createdChannels.clear();
          QueueHealthService.registerStatus(
            this.connectionName,
            QueueConnectionStatus.RECONNECTING
          );
          this.scheduleReconnect();
        }
      });

      this.connection.on('blocked', (reason: string) => {
        logger.warn(
          { connectionName: this.connectionName, reason },
          'RabbitMQ connection blocked by broker'
        );
      });

      this.connection.on('unblocked', () => {
        logger.info({ connectionName: this.connectionName }, 'RabbitMQ connection unblocked');
      });

      // Create shared channel for simple operations
      this.sharedChannel = await this.createManagedChannel();

      QueueHealthService.registerStatus(this.connectionName, QueueConnectionStatus.CONNECTED);
      logger.info({ connectionName: this.connectionName }, 'RabbitMQ connected successfully');
    } catch (error) {
      logger.error(
        { err: error, connectionName: this.connectionName },
        'Failed to connect to RabbitMQ'
      );
      QueueHealthService.registerStatus(this.connectionName, QueueConnectionStatus.DISCONNECTED);
      this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * Create a managed channel with error handlers
   */
  private async createManagedChannel(): Promise<Channel> {
    if (!this.connection) {
      throw new Error('Not connected to RabbitMQ');
    }

    const channel = await this.connection.createChannel();
    await channel.prefetch(this.prefetch);

    channel.on('error', (err: Error) => {
      logger.error({ err, connectionName: this.connectionName }, 'RabbitMQ channel error');
      this.createdChannels.delete(channel);
    });

    channel.on('close', () => {
      if (!this.isShuttingDown) {
        logger.warn({ connectionName: this.connectionName }, 'RabbitMQ channel closed');
      }
      this.createdChannels.delete(channel);
    });

    this.createdChannels.add(channel);
    return channel;
  }

  /**
   * Schedule reconnection with exponential backoff and jitter
   */
  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts++;

    // Check max attempts (0 = unlimited)
    if (this.maxReconnectAttempts > 0 && this.reconnectAttempts > this.maxReconnectAttempts) {
      logger.error(
        { connectionName: this.connectionName, attempts: this.reconnectAttempts },
        'Max reconnection attempts reached, marking connection as dead'
      );
      QueueHealthService.registerStatus(this.connectionName, QueueConnectionStatus.DEAD);
      return;
    }

    // Calculate delay with exponential backoff and jitter
    const exponentialDelay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS
    );
    // Add jitter (0-25% of delay) to prevent thundering herd
    const jitter = Math.random() * exponentialDelay * 0.25;
    const delay = Math.floor(exponentialDelay + jitter);

    logger.info(
      {
        connectionName: this.connectionName,
        attempt: this.reconnectAttempts,
        delayMs: delay,
      },
      'Scheduling RabbitMQ reconnection...'
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        // Error already logged in connect()
      });
    }, delay);
  }

  /**
   * Get the shared channel (for simple operations)
   * Note: For consumers, use createChannel() instead
   */
  async getChannel(): Promise<Channel> {
    if (!this.sharedChannel) {
      await this.connect();
    }
    if (!this.sharedChannel) {
      throw new Error('Failed to get RabbitMQ channel');
    }
    return this.sharedChannel;
  }

  /**
   * Create a dedicated channel for a consumer
   * Best Practice: Each consumer should have its own channel to:
   * - Avoid blocking other consumers during long operations
   * - Prevent channel closure from affecting other consumers
   * - Allow independent prefetch settings
   */
  async createChannel(): Promise<Channel> {
    if (!this.connection) {
      await this.connect();
    }
    if (!this.connection) {
      throw new Error('Failed to get RabbitMQ connection');
    }

    const channel = await this.createManagedChannel();
    logger.debug(
      { connectionName: this.connectionName, channelCount: this.createdChannels.size },
      'Created dedicated channel'
    );

    return channel;
  }

  /**
   * Get confirm channel for guaranteed delivery
   * Best Practice: Use confirm channel for critical messages that must not be lost
   */
  async getConfirmChannel(): Promise<ConfirmChannel> {
    if (!this.confirmChannel) {
      if (!this.connection) {
        await this.connect();
      }
      if (!this.connection) {
        throw new Error('Failed to get RabbitMQ connection');
      }

      this.confirmChannel = await this.connection.createConfirmChannel();
      await this.confirmChannel.prefetch(this.prefetch);

      this.confirmChannel.on('error', (err: Error) => {
        logger.error(
          { err, connectionName: this.connectionName },
          'RabbitMQ confirm channel error'
        );
        this.confirmChannel = null;
      });

      this.confirmChannel.on('close', () => {
        if (!this.isShuttingDown) {
          logger.warn({ connectionName: this.connectionName }, 'RabbitMQ confirm channel closed');
        }
        this.confirmChannel = null;
      });

      logger.debug({ connectionName: this.connectionName }, 'Created confirm channel');
    }

    return this.confirmChannel;
  }

  /**
   * Close connection gracefully
   */
  async close(): Promise<void> {
    this.isShuttingDown = true;

    // Cancel reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      // Close all created channels
      const closePromises: Promise<void>[] = [];

      for (const channel of this.createdChannels) {
        closePromises.push(
          channel.close().catch((err: unknown) => {
            logger.debug({ err }, 'Error closing channel');
          })
        );
      }

      if (this.sharedChannel && !this.createdChannels.has(this.sharedChannel)) {
        closePromises.push(
          this.sharedChannel.close().catch((err: unknown) => {
            logger.debug({ err }, 'Error closing shared channel');
          })
        );
      }

      if (this.confirmChannel) {
        closePromises.push(
          this.confirmChannel.close().catch((err: unknown) => {
            logger.debug({ err }, 'Error closing confirm channel');
          })
        );
      }

      await Promise.all(closePromises);

      if (this.connection) {
        await this.connection.close();
      }

      this.connection = null;
      this.sharedChannel = null;
      this.confirmChannel = null;
      this.createdChannels.clear();

      QueueHealthService.unregisterConnection(this.connectionName);
      logger.info({ connectionName: this.connectionName }, 'RabbitMQ connection closed gracefully');
    } catch (error) {
      logger.error(
        { err: error, connectionName: this.connectionName },
        'Error closing RabbitMQ connection'
      );
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connection !== null;
  }

  /**
   * Get connection name
   */
  getConnectionName(): string {
    return this.connectionName;
  }

  /**
   * Get connection stats
   */
  getStats(): {
    connected: boolean;
    reconnectAttempts: number;
    channelCount: number;
    hasConfirmChannel: boolean;
  } {
    return {
      connected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      channelCount: this.createdChannels.size,
      hasConfirmChannel: this.confirmChannel !== null,
    };
  }
}
