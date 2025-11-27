import { FastifyInstance } from 'fastify';
import logger from '../logger/logger.js';
import config from '../../config/env.js';

/**
 * Shutdown handler type
 */
type ShutdownHandler = () => Promise<void>;

/**
 * GracefulShutdown - Manages clean application shutdown
 * Ensures all resources are properly released before exit
 */
class GracefulShutdownManager {
  private handlers: Map<string, ShutdownHandler> = new Map();
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;

  /**
   * Register a shutdown handler
   * @param name - Unique name for the handler (for logging)
   * @param handler - Async function to execute during shutdown
   */
  register(name: string, handler: ShutdownHandler): void {
    if (this.handlers.has(name)) {
      logger.warn({ name }, 'Shutdown handler already registered, replacing');
    }
    this.handlers.set(name, handler);
    logger.debug({ name }, 'Shutdown handler registered');
  }

  /**
   * Unregister a shutdown handler
   */
  unregister(name: string): void {
    this.handlers.delete(name);
  }

  /**
   * Register Fastify server for shutdown
   */
  registerFastify(fastify: FastifyInstance): void {
    this.register('fastify', async () => {
      logger.info('Closing HTTP server...');
      await fastify.close();
      logger.info('HTTP server closed');
    });
  }

  /**
   * Execute graceful shutdown
   */
  async shutdown(signal: string): Promise<void> {
    // Prevent multiple shutdown calls
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return this.shutdownPromise!;
    }

    this.isShuttingDown = true;
    logger.info({ signal }, '🛑 Graceful shutdown initiated');

    this.shutdownPromise = this.executeShutdown();
    return this.shutdownPromise;
  }

  private async executeShutdown(): Promise<void> {
    const timeout = config.SHUTDOWN_TIMEOUT_MS;
    const startTime = Date.now();

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Shutdown timeout after ${timeout}ms`));
      }, timeout);
    });

    try {
      // Execute all handlers with timeout
      await Promise.race([this.executeHandlers(), timeoutPromise]);

      const duration = Date.now() - startTime;
      logger.info({ duration }, '✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ err: error, duration }, '❌ Graceful shutdown failed');
      process.exit(1);
    }
  }

  private async executeHandlers(): Promise<void> {
    // Execute handlers in reverse order (LIFO)
    const handlers = Array.from(this.handlers.entries()).reverse();

    for (const [name, handler] of handlers) {
      try {
        logger.info({ handler: name }, `Executing shutdown handler: ${name}`);
        await handler();
        logger.info({ handler: name }, `Shutdown handler completed: ${name}`);
      } catch (error) {
        logger.error({ err: error, handler: name }, `Shutdown handler failed: ${name}`);
        // Continue with other handlers even if one fails
      }
    }
  }

  /**
   * Setup process signal handlers
   */
  setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

    for (const signal of signals) {
      process.on(signal, () => {
        void this.shutdown(signal);
      });
    }

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.fatal({ err: error }, 'Uncaught exception');
      void this.shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      logger.fatal({ reason }, 'Unhandled rejection');
      void this.shutdown('unhandledRejection');
    });

    logger.info('Signal handlers registered');
  }

  /**
   * Check if shutdown is in progress
   */
  isInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Reset state (for testing)
   */
  reset(): void {
    this.handlers.clear();
    this.isShuttingDown = false;
    this.shutdownPromise = null;
  }
}

export const gracefulShutdown = new GracefulShutdownManager();
