/**
 * Microservice Boilerplate
 * Production-ready Clean Architecture Template
 */

// Observability bootstrap: normally preloaded via `node --import ./dist/instrumentation.js`.
// Importing it first here is a fallback so Sentry/OTel still initialize (with reduced
// ESM auto-instrumentation coverage) if the process is started without the preload flag.
import { shutdownTracing } from './instrumentation.js';

// Application imports
import { createServer } from './app/server.js';
import { registerDependencies } from './container.js';
import config from './config/env.js';
import logger from './infra/logger/logger.js';
import { gracefulShutdown } from './infra/shutdown/gracefulShutdown.js';
import { flushSentry, closeSentry } from './infra/monitoring/sentry.js';

// gRPC imports (enabled via GRPC_ENABLED=true)
import { startGrpcServer, stopGrpcServer } from './grpc/index.js';

// Database imports
import { initializeDatabase, closeDatabase } from './infra/db/database.js';
import { initializeRedis, closeRedis } from './infra/redis/redis.js';

// Queue imports
import { ConnectionManager } from './infra/queue/index.js';
// import { ExampleConsumer } from './infra/queue/index.js';
// import { ExamplePublisher } from './infra/queue/index.js';

/** Initialize RabbitMQ connection and queue components */
async function initializeQueue(): Promise<void> {
  if (!config.RABBITMQ_ENABLED) {
    logger.info('⏭️  RabbitMQ disabled (RABBITMQ_ENABLED=false)');
    return;
  }

  try {
    const queueConnection = new ConnectionManager({
      host: config.RABBITMQ_HOST,
      port: config.RABBITMQ_PORT,
      username: config.RABBITMQ_USERNAME,
      password: config.RABBITMQ_PASSWORD,
      vhost: config.RABBITMQ_VHOST,
      autoCreateVhost: true,
      connectionName: `${config.SERVICE_NAME}_${config.NODE_ENV}_${config.RABBITMQ_DEVICE_ID}`,
      prefetch: config.RABBITMQ_PREFETCH,
    });

    await queueConnection.connect();

    // Initialize publisher (uncomment when needed)
    // const examplePublisher = new ExamplePublisher(queueConnection);
    // await examplePublisher.initialize();
    // logger.info('✅ ExamplePublisher initialized');

    // Initialize consumer (uncomment when needed)
    // const exampleConsumer = new ExampleConsumer(queueConnection);
    // await exampleConsumer.initialize();
    // await exampleConsumer.start();
    // logger.info('✅ ExampleConsumer started');

    // Register shutdown handlers
    // gracefulShutdown.register('example-consumer', async () => {
    //   await exampleConsumer.close();
    // });
    gracefulShutdown.register('queue-connection', async () => {
      await queueConnection.close();
    });

    logger.info('✅ RabbitMQ connected');
  } catch (error) {
    logger.warn({ err: error }, '⚠️  RabbitMQ connection failed');
  }
}

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
    // (Sentry + OpenTelemetry already initialized in instrumentation.ts preload)
    // ============================================

    // 1. Setup signal handlers for graceful shutdown
    gracefulShutdown.setupSignalHandlers();

    // 2. Register shutdown handlers
    gracefulShutdown.register('opentelemetry', async () => {
      await shutdownTracing();
    });

    gracefulShutdown.register('sentry', async () => {
      await flushSentry();
      await closeSentry();
    });

    // 3. Initialize dependency injection
    registerDependencies();

    // 4. Initialize Redis (shared across application)
    await initializeRedis();
    gracefulShutdown.register('redis', async () => {
      await closeRedis();
    });

    // 5. Initialize database connection (MySQLAdapter + HealthChecker + PerformanceMonitor)
    await initializeDatabase();
    gracefulShutdown.register('database', async () => {
      await closeDatabase();
    });

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

    // 8. Initialize RabbitMQ (if enabled)
    await initializeQueue();

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
