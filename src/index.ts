/**
 * Microservice Boilerplate
 * Production-ready Clean Architecture Template
 */

// Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

// Initialize OpenTelemetry (must be before other imports for best results)
import { initializeTracing, shutdownTracing } from './infra/monitoring/tracing.js';
initializeTracing();

// Application imports
import { createServer } from './app/server.js';
import { registerDependencies } from './container.js';
import config from './config/env.js';
import logger from './infra/logger/logger.js';
import { gracefulShutdown } from './infra/shutdown/gracefulShutdown.js';
import { initializeSentry, flushSentry, closeSentry } from './infra/monitoring/sentry.js';

// gRPC imports (enabled via GRPC_ENABLED=true)
import { startGrpcServer, stopGrpcServer } from './grpc/index.js';

// Queue imports (uncomment to use)
// import { QueueConnection, ExampleConsumer } from './infra/queue/index.js';

async function main(): Promise<void> {
  try {
    logger.info(
      {
        service: config.SERVICE_NAME,
        version: config.SERVICE_VERSION,
        env: config.NODE_ENV,
        nodeVersion: process.version,
      },
      '🚀 Starting service...'
    );

    // ============================================
    // INITIALIZATION ORDER MATTERS!
    // ============================================

    // 1. Initialize error tracking (Sentry)
    initializeSentry();

    // 2. Setup signal handlers for graceful shutdown
    gracefulShutdown.setupSignalHandlers();

    // 3. Register shutdown handlers
    gracefulShutdown.register('opentelemetry', async () => {
      await shutdownTracing();
    });

    gracefulShutdown.register('sentry', async () => {
      await flushSentry();
      await closeSentry();
    });

    // 4. Initialize dependency injection
    registerDependencies();

    // 5. Initialize database connection (uncomment when needed)
    // await initializeDatabase();
    // gracefulShutdown.register('database', async () => {
    //   await closeDatabase();
    // });

    // 6. Create and start HTTP server
    const server = await createServer();
    await server.listen({ port: config.PORT, host: '0.0.0.0' });

    logger.info(
      {
        port: config.PORT,
        docs: config.NODE_ENV !== 'production' ? `http://localhost:${config.PORT}/docs` : undefined,
      },
      '✅ HTTP server started'
    );

    // 7. Start gRPC server (if enabled)
    if (config.GRPC_ENABLED) {
      await startGrpcServer(config.GRPC_PORT);
      gracefulShutdown.register('grpc', async () => {
        await stopGrpcServer();
      });
      logger.info({ port: config.GRPC_PORT }, '✅ gRPC server started');
    } else {
      logger.info('⏭️  gRPC server disabled (GRPC_ENABLED=false)');
    }

    // 8. Start queue consumer (uncomment when needed)
    // if (config.RABBITMQ_URL && config.RABBITMQ_QUEUE_NAME) {
    //   const queueConnection = new QueueConnection({
    //     url: config.RABBITMQ_URL,
    //     connectionName: 'main',
    //     prefetch: config.RABBITMQ_PREFETCH,
    //   });
    //   await queueConnection.connect();
    //
    //   const exampleConsumer = new ExampleConsumer(queueConnection, config.RABBITMQ_QUEUE_NAME);
    //   await exampleConsumer.start();
    //
    //   gracefulShutdown.register('queue-consumer', async () => {
    //     await exampleConsumer.stop();
    //   });
    //   gracefulShutdown.register('queue-connection', async () => {
    //     await queueConnection.close();
    //   });
    //
    //   logger.info({ queue: config.RABBITMQ_QUEUE_NAME }, '✅ Queue consumer started');
    // }

    logger.info(
      {
        service: config.SERVICE_NAME,
        version: config.SERVICE_VERSION,
        pid: process.pid,
      },
      '🎉 Service started successfully'
    );
  } catch (error) {
    logger.fatal({ err: error }, '💥 Failed to start service');
    process.exit(1);
  }
}

// Start the application
void main();
