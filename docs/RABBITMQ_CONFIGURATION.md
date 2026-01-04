# RabbitMQ Configuration Guide

## Overview

This guide explains how to configure RabbitMQ for LobsterLead microservices. The configuration is designed to support:
- Multiple developers working on the same RabbitMQ server
- Environment isolation (development, staging, production)
- Queue naming conventions for easy debugging

## Environment Variables

```bash
# ============================================
# RABBITMQ Configuration
# ============================================
RABBITMQ_ENABLED=false           # Enable/disable RabbitMQ connection
RABBITMQ_HOST=34.170.206.207     # RabbitMQ server host
RABBITMQ_PORT=5672               # RabbitMQ server port
RABBITMQ_USERNAME=root           # RabbitMQ username
RABBITMQ_PASSWORD=Ll123456@.     # RabbitMQ password
RABBITMQ_VHOST=/                 # RabbitMQ virtual host
RABBITMQ_DEVICE_ID=local         # Device identifier for queue isolation
RABBITMQ_PREFETCH=10             # Number of messages to prefetch
```

## Queue Naming Convention

Queues are named using the following pattern:
```
{SERVICE_NAME}_{NODE_ENV}_{DEVICE_ID}_{queue_type}
```

### Examples:
- `knowledge-service_development_berke-local_file_processing`
- `knowledge-service_production_prod-server-1_file_processing`
- `ai-service_staging_ci-runner_job_queue`

## Device ID Guidelines

The `RABBITMQ_DEVICE_ID` is used to isolate queues between different machines/developers:

| Environment | Example Device ID | Description |
|-------------|------------------|-------------|
| Local Dev   | `berke-local`    | Developer's machine |
| Local Dev   | `ahmet-macbook`  | Another developer |
| CI/CD       | `ci-runner`      | GitHub Actions, Jenkins |
| Staging     | `staging-1`      | Staging server |
| Production  | `prod-server-1`  | Production server 1 |
| Production  | `prod-server-2`  | Production server 2 |

## Connection URL Format

The connection URL is automatically built from individual parameters:
```
amqp://{username}:{password}@{host}:{port}/{vhost}
```

## Usage in Code

### QueueConnection Class

```typescript
import { QueueConnection } from './infra/queue/QueueConnection.js';

const queueConnection = new QueueConnection({
  host: config.RABBITMQ_HOST,
  port: config.RABBITMQ_PORT,
  username: config.RABBITMQ_USERNAME,
  password: config.RABBITMQ_PASSWORD,
  vhost: config.RABBITMQ_VHOST,
  connectionName: `${config.SERVICE_NAME}_${config.NODE_ENV}_${config.RABBITMQ_DEVICE_ID}`,
  prefetch: config.RABBITMQ_PREFETCH,
});

await queueConnection.connect();
```

### Queue Name Generation

```typescript
function getQueueName(queueType: string): string {
  const { SERVICE_NAME, NODE_ENV, RABBITMQ_DEVICE_ID } = config;
  return `${SERVICE_NAME}_${NODE_ENV}_${RABBITMQ_DEVICE_ID}_${queueType}`;
}

// Example: "knowledge-service_development_berke-local_file_processing"
const queueName = getQueueName('file_processing');
```

## Production Considerations

1. **High Availability**: Use RabbitMQ cluster in production
2. **TLS**: Enable TLS for secure connections
3. **Credentials**: Use environment-specific credentials
4. **Vhost Isolation**: Consider separate vhosts per environment
5. **Monitoring**: Enable RabbitMQ management plugin

## Troubleshooting

### Connection Refused
```
Error: connect ECONNREFUSED 127.0.0.1:5672
```
- Check if RabbitMQ is running
- Verify host and port settings
- Check firewall rules

### Authentication Failed
```
Error: ACCESS_REFUSED - Login was refused
```
- Verify username and password
- Check user permissions in RabbitMQ

### Queue Not Found
- Ensure queue exists or is declared before consuming
- Check queue naming convention matches

## Related Documentation

- [RabbitMQ Official Docs](https://www.rabbitmq.com/documentation.html)
- [amqplib Documentation](https://amqp-node.github.io/amqplib/)
