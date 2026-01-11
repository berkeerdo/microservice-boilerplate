# RabbitMQ Integration Guide

Industry-standard RabbitMQ implementation for LobsterLead microservices.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RabbitMQ Broker                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Exchange   │───▶│    Queue     │───▶│  Dead Letter │          │
│  │ (topic/fanout)│    │   + Retry    │    │    Queue     │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
         ▲                     │
         │                     ▼
┌────────┴────────┐    ┌──────────────────┐
│   Publisher     │    │    Consumer       │
│  (Confirm Mode) │    │ (Circuit Breaker) │
└─────────────────┘    └──────────────────┘
```

## Features

### QueueConnection
- **Auto-reconnection** with exponential backoff and jitter
- **Connection heartbeat** for health monitoring
- **Dedicated channels** per consumer (prevents blocking)
- **Confirm channels** for publishers (guaranteed delivery)
- **Graceful shutdown** handling

### BaseConsumer
- **Automatic retry** with exponential backoff (configurable max retries)
- **Dead Letter Queue (DLQ)** for failed messages
- **Circuit breaker** pattern for fault tolerance
- **Message context** with correlation IDs for tracing
- **Prefetch control** for throughput management

### BasePublisher
- **Publisher confirms** for guaranteed delivery
- **Retry logic** with exponential backoff
- **Circuit breaker** integration
- **Result tracking** (success/failure with retry count)

### CircuitBreaker
- Three states: CLOSED, OPEN, HALF_OPEN
- Configurable failure threshold
- Automatic recovery testing
- Prevents cascading failures

## Quick Start

### 1. Create Connection

```typescript
import { QueueConnection } from './infra/queue';

const connection = new QueueConnection({
  host: config.RABBITMQ_HOST,
  port: config.RABBITMQ_PORT,
  username: config.RABBITMQ_USERNAME,
  password: config.RABBITMQ_PASSWORD,
  vhost: config.RABBITMQ_VHOST,
  connectionName: 'my-service',
  prefetch: 10,
});

await connection.connect();
```

### 2. Create Publisher

```typescript
import { BasePublisher } from './infra/queue';

class MyEventPublisher extends BasePublisher {
  constructor(connection: QueueConnection) {
    super(connection, {
      exchangeName: 'my-service.events',
      exchangeType: 'topic',
      useConfirms: true,
      maxRetries: 3,
    });
  }

  async publishUserCreated(userId: number) {
    return this.publish('user.created', {
      userId,
      timestamp: new Date().toISOString(),
    });
  }
}

// Usage
const publisher = new MyEventPublisher(connection);
await publisher.initialize();
const result = await publisher.publishUserCreated(123);
if (!result.success) {
  console.error('Failed:', result.error);
}
```

### 3. Create Consumer

```typescript
import { BaseConsumer, MessageContext } from './infra/queue';

class UserEventConsumer extends BaseConsumer {
  constructor(connection: QueueConnection) {
    super(connection, {
      queueName: 'my-service.user-events',
      exchangeName: 'user-service.events',
      routingKeys: ['user.created', 'user.updated'],
      prefetch: 5,
      maxRetries: 3,
    });
  }

  protected async processMessage(
    content: unknown,
    context: MessageContext
  ): Promise<void> {
    const { routingKey, correlationId } = context;

    switch (routingKey) {
      case 'user.created':
        await this.handleUserCreated(content);
        break;
      case 'user.updated':
        await this.handleUserUpdated(content);
        break;
    }
  }

  private async handleUserCreated(event: unknown) {
    // Process event...
  }
}

// Usage
const consumer = new UserEventConsumer(connection);
await consumer.initialize();
await consumer.startConsuming();
```

## Configuration

### Environment Variables

```bash
# Enable/Disable RabbitMQ
RABBITMQ_ENABLED=true

# Connection
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VHOST=/

# Performance
RABBITMQ_PREFETCH=10
```

### Consumer Options

```typescript
interface ConsumerOptions {
  queueName: string;           // Queue to consume from
  exchangeName: string;        // Exchange to bind to
  routingKeys: string[];       // Routing patterns
  prefetch?: number;           // Messages to prefetch (default: 10)
  maxRetries?: number;         // Max retry attempts (default: 3)
  initialRetryDelayMs?: number;// First retry delay (default: 1000)
  maxRetryDelayMs?: number;    // Max retry delay (default: 30000)
  useCircuitBreaker?: boolean; // Enable circuit breaker (default: true)
  circuitBreakerThreshold?: number; // Failures before open (default: 5)
  exchangeType?: string;       // Exchange type (default: topic)
}
```

### Publisher Options

```typescript
interface PublisherOptions {
  exchangeName: string;        // Exchange to publish to
  exchangeType?: string;       // Exchange type (default: topic)
  useConfirms?: boolean;       // Use publisher confirms (default: true)
  maxRetries?: number;         // Max retry attempts (default: 3)
  initialRetryDelayMs?: number;// First retry delay (default: 100)
  maxRetryDelayMs?: number;    // Max retry delay (default: 5000)
  useCircuitBreaker?: boolean; // Enable circuit breaker (default: true)
}
```

## Message Flow

### Publishing

```
1. Publisher.publish()
     │
     ▼
2. Circuit Breaker check
     │ (if open, fail fast)
     ▼
3. Serialize message to JSON
     │
     ▼
4. Publish to exchange (with confirms)
     │
     ├─▶ Success: Return PublishResult { success: true }
     │
     └─▶ Failure: Retry with backoff
           │
           ├─▶ Max retries: Return { success: false, error }
           │
           └─▶ Retry: Wait, then go to step 3
```

### Consuming

```
1. Message received from queue
     │
     ▼
2. Parse message content
     │
     ▼
3. Circuit Breaker check
     │ (if open, requeue for later)
     ▼
4. Call processMessage()
     │
     ├─▶ Success: ACK message
     │
     └─▶ Failure: Check retry count
           │
           ├─▶ Under max: Schedule retry with backoff
           │
           └─▶ At max: NACK → DLQ
```

## Retry Strategy

Exponential backoff with jitter:

```
delay = min(initialDelay × 2^(retryCount-1), maxDelay) + random(0, delay×0.25)
```

Example with defaults:
- Retry 1: ~1000ms
- Retry 2: ~2000ms
- Retry 3: ~4000ms

## Dead Letter Queue (DLQ)

Messages that fail after max retries go to DLQ:

```
Queue: my-service.user-events
  │
  ▼ (after 3 failures)
DLQ: my-service.user-events.dlq
```

Headers added to DLQ messages:
- `x-retry-count`: Number of retries attempted
- `x-first-failure-time`: Timestamp of first failure
- `x-last-error`: Last error message
- `x-original-routing-key`: Original routing key

## Circuit Breaker

Prevents cascading failures:

```
CLOSED ──(failures > threshold)──▶ OPEN
   ▲                                  │
   │                          (resetTimeout)
   │                                  ▼
   └────(successes > threshold)── HALF_OPEN
```

States:
- **CLOSED**: Normal operation, all requests pass
- **OPEN**: All requests fail immediately (fast fail)
- **HALF_OPEN**: Testing recovery, limited requests

## Health Monitoring

```typescript
import { QueueHealthService } from './infra/queue';

// Check all connections
const status = QueueHealthService.getOverallStatus();
// 'healthy' | 'degraded' | 'dead' | 'not_configured'

// Get individual statuses
const statuses = QueueHealthService.getAllStatuses();
// { 'my-connection': 'connected', ... }
```

## Best Practices

### 1. One Channel Per Consumer
Each consumer gets its own channel to avoid blocking:
```typescript
// BaseConsumer does this automatically
this.channel = await this.queueConnection.createChannel();
```

### 2. Use Confirm Channel for Critical Messages
```typescript
const publisher = new BasePublisher(connection, {
  useConfirms: true, // Guaranteed delivery
});
```

### 3. Set Appropriate Prefetch
```typescript
// High throughput, lightweight processing
prefetch: 50

// Low throughput, heavy processing
prefetch: 1
```

### 4. Handle Errors Gracefully
```typescript
protected async processMessage(content: unknown, context: MessageContext) {
  try {
    await this.doWork(content);
  } catch (error) {
    if (this.isTemporaryError(error)) {
      throw error; // Will retry
    }
    // Permanent error - log and don't retry
    logger.error({ error }, 'Permanent failure');
  }
}
```

### 5. Use Correlation IDs
```typescript
// Publisher
await publisher.publish('event', data, { correlationId: requestId });

// Consumer
processMessage(content, context) {
  const { correlationId } = context;
  logger.info({ correlationId }, 'Processing');
}
```

## Graceful Shutdown

```typescript
// Register shutdown handlers
gracefulShutdown.register('queue-connection', async () => {
  await consumer.close();
  await connection.close();
});
```

## Troubleshooting

### Connection Issues
```
Error: Failed to connect to RabbitMQ
```
- Check RabbitMQ is running
- Verify credentials and host/port
- Check firewall rules

### Message Processing Failures
```
Warning: Message exceeded max retries, sending to DLQ
```
- Check DLQ for failed messages
- Review error in `x-last-error` header
- Fix processing logic and replay from DLQ

### Circuit Breaker Open
```
Info: Circuit breaker state changed from CLOSED to OPEN
```
- Check downstream service health
- Wait for reset timeout
- Investigate root cause of failures
