/**
 * RabbitMQ Connection Manager
 * Handles connection lifecycle with automatic reconnection
 */
import amqplib from 'amqplib';
import type { Channel, ConfirmChannel } from 'amqplib';
import logger from '../logger/logger.js';
import { QueueHealthService, QueueConnectionStatus } from './QueueHealthService.js';

const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;

export interface QueueConnectionOptions {
  url: string;
  connectionName?: string;
  prefetch?: number;
}

// amqplib connection type (using Awaited to get resolved type)
type AmqpConnection = Awaited<ReturnType<typeof amqplib.connect>>;

/**
 * QueueConnection - Manages RabbitMQ connection with auto-reconnect
 */
export class QueueConnection {
  private connection: AmqpConnection | null = null;
  private channel: Channel | null = null;
  private confirmChannel: ConfirmChannel | null = null;
  private reconnectAttempts = 0;
  private isShuttingDown = false;
  private readonly options: Required<QueueConnectionOptions>;

  constructor(options: QueueConnectionOptions) {
    this.options = {
      connectionName: 'default',
      prefetch: 10,
      ...options,
    };
  }

  /**
   * Connect to RabbitMQ
   */
  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    QueueHealthService.registerStatus(
      this.options.connectionName,
      QueueConnectionStatus.CONNECTING
    );

    try {
      logger.info({ connectionName: this.options.connectionName }, 'Connecting to RabbitMQ...');

      this.connection = await amqplib.connect(this.options.url);
      this.reconnectAttempts = 0;

      // Setup connection event handlers
      this.connection.on('error', (err: Error) => {
        logger.error(
          { err, connectionName: this.options.connectionName },
          'RabbitMQ connection error'
        );
      });

      this.connection.on('close', () => {
        if (!this.isShuttingDown) {
          logger.warn(
            { connectionName: this.options.connectionName },
            'RabbitMQ connection closed, reconnecting...'
          );
          QueueHealthService.registerStatus(
            this.options.connectionName,
            QueueConnectionStatus.RECONNECTING
          );
          this.scheduleReconnect();
        }
      });

      // Create channel
      this.channel = await this.connection.createChannel();
      await this.channel.prefetch(this.options.prefetch);

      this.channel.on('error', (err: Error) => {
        logger.error(
          { err, connectionName: this.options.connectionName },
          'RabbitMQ channel error'
        );
      });

      this.channel.on('close', () => {
        if (!this.isShuttingDown) {
          logger.warn({ connectionName: this.options.connectionName }, 'RabbitMQ channel closed');
          this.channel = null;
        }
      });

      QueueHealthService.registerStatus(
        this.options.connectionName,
        QueueConnectionStatus.CONNECTED
      );
      logger.info(
        { connectionName: this.options.connectionName },
        'RabbitMQ connected successfully'
      );
    } catch (error) {
      logger.error(
        { err: error, connectionName: this.options.connectionName },
        'Failed to connect to RabbitMQ'
      );
      QueueHealthService.registerStatus(
        this.options.connectionName,
        QueueConnectionStatus.DISCONNECTED
      );
      this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.isShuttingDown) return;

    this.reconnectAttempts++;

    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      logger.error(
        { connectionName: this.options.connectionName, attempts: this.reconnectAttempts },
        'Max reconnection attempts reached, marking as dead'
      );
      QueueHealthService.registerStatus(this.options.connectionName, QueueConnectionStatus.DEAD);
      return;
    }

    const delay = RECONNECT_DELAY_MS * this.reconnectAttempts;
    logger.info(
      {
        connectionName: this.options.connectionName,
        attempt: this.reconnectAttempts,
        delayMs: delay,
      },
      'Scheduling reconnection...'
    );

    setTimeout(() => {
      this.connection = null;
      this.channel = null;
      this.connect().catch(() => {
        // Error already logged in connect()
      });
    }, delay);
  }

  /**
   * Get the channel (creates if needed)
   */
  async getChannel(): Promise<Channel> {
    if (!this.channel) {
      await this.connect();
    }
    if (!this.channel) {
      throw new Error('Failed to get RabbitMQ channel');
    }
    return this.channel;
  }

  /**
   * Get confirm channel for publisher confirms
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
      await this.confirmChannel.prefetch(this.options.prefetch);
    }
    return this.confirmChannel;
  }

  /**
   * Close connection gracefully
   */
  async close(): Promise<void> {
    this.isShuttingDown = true;

    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }

      if (this.confirmChannel) {
        await this.confirmChannel.close();
        this.confirmChannel = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }

      QueueHealthService.unregisterConnection(this.options.connectionName);
      logger.info(
        { connectionName: this.options.connectionName },
        'RabbitMQ connection closed gracefully'
      );
    } catch (error) {
      logger.error(
        { err: error, connectionName: this.options.connectionName },
        'Error closing RabbitMQ connection'
      );
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }
}
