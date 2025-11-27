# gRPC Guide

This guide covers how to implement gRPC services in this boilerplate for inter-service communication.

## Why gRPC?

| Feature | REST | gRPC |
|---------|------|------|
| Protocol | HTTP/1.1 | HTTP/2 |
| Payload | JSON (text) | Protocol Buffers (binary) |
| Performance | Baseline | ~7-10x faster |
| Type Safety | Manual (OpenAPI) | Built-in (Proto) |
| Streaming | Limited | Full duplex |
| Code Generation | Optional | Native |

**Use gRPC when:**
- Service-to-service communication (internal)
- High performance required
- Strong typing needed
- Bi-directional streaming

**Use REST when:**
- Public APIs (browser clients)
- Simple CRUD operations
- Caching important (HTTP caching)

## Project Structure

```
src/grpc/
├── protos/           # Protocol Buffer definitions
│   └── service.proto
├── handlers/         # RPC method implementations
│   └── exampleHandler.ts
├── server.ts         # gRPC server setup
└── client.ts         # gRPC client factory
```

## Step 1: Define Protocol Buffers

```protobuf
// src/grpc/protos/service.proto
syntax = "proto3";

package microservice;

service ExampleService {
  rpc GetExample (GetExampleRequest) returns (ExampleResponse);
  rpc CreateExample (CreateExampleRequest) returns (ExampleResponse);
  rpc ListExamples (ListExamplesRequest) returns (ListExamplesResponse);

  // Streaming example
  rpc WatchExamples (WatchRequest) returns (stream ExampleResponse);
}

message GetExampleRequest {
  int32 id = 1;
}

message CreateExampleRequest {
  string name = 1;
}

message ExampleResponse {
  int32 id = 1;
  string name = 2;
  string created_at = 3;
  string updated_at = 4;
}

message ListExamplesRequest {
  int32 limit = 1;
  int32 offset = 2;
}

message ListExamplesResponse {
  repeated ExampleResponse examples = 1;
  int32 total = 2;
}

message WatchRequest {
  // Empty for now
}
```

## Step 2: Generate TypeScript Types

Install proto-loader for type generation:

```bash
npm install @grpc/proto-loader
```

Generate types:

```bash
npx proto-loader-gen-types \
  --longs=String \
  --enums=String \
  --defaults \
  --oneofs \
  --grpcLib=@grpc/grpc-js \
  --outDir=src/grpc/generated \
  src/grpc/protos/*.proto
```

Add to `package.json`:

```json
{
  "scripts": {
    "proto:generate": "proto-loader-gen-types --longs=String --enums=String --defaults --oneofs --grpcLib=@grpc/grpc-js --outDir=src/grpc/generated src/grpc/protos/*.proto"
  }
}
```

## Step 3: Implement Handlers

```typescript
// src/grpc/handlers/exampleHandler.ts
import * as grpc from '@grpc/grpc-js';
import { container } from '../../container.js';
import { TOKENS } from '../../container.js';
import {
  GetExampleUseCase,
  CreateExampleUseCase,
  ListExamplesUseCase,
} from '../../application/useCases/index.js';
import logger from '../../infra/logger/logger.js';

// Import generated types
import { ExampleServiceHandlers } from '../generated/microservice/ExampleService.js';
import { GetExampleRequest } from '../generated/microservice/GetExampleRequest.js';
import { CreateExampleRequest } from '../generated/microservice/CreateExampleRequest.js';
import { ListExamplesRequest } from '../generated/microservice/ListExamplesRequest.js';
import { ExampleResponse } from '../generated/microservice/ExampleResponse.js';

export const exampleHandlers: ExampleServiceHandlers = {
  GetExample: async (
    call: grpc.ServerUnaryCall<GetExampleRequest, ExampleResponse>,
    callback: grpc.sendUnaryData<ExampleResponse>
  ) => {
    try {
      const useCase = container.resolve<GetExampleUseCase>(TOKENS.GetExampleUseCase);
      const result = await useCase.execute({ id: call.request.id });

      if (!result) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: `Example with id ${call.request.id} not found`,
        });
      }

      callback(null, {
        id: result.id,
        name: result.name,
        created_at: result.createdAt.toISOString(),
        updated_at: result.updatedAt.toISOString(),
      });
    } catch (error) {
      logger.error({ err: error }, 'GetExample failed');
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error',
      });
    }
  },

  CreateExample: async (
    call: grpc.ServerUnaryCall<CreateExampleRequest, ExampleResponse>,
    callback: grpc.sendUnaryData<ExampleResponse>
  ) => {
    try {
      const useCase = container.resolve<CreateExampleUseCase>(TOKENS.CreateExampleUseCase);
      const result = await useCase.execute({ name: call.request.name });

      callback(null, {
        id: result.id,
        name: result.name,
        created_at: result.createdAt.toISOString(),
        updated_at: result.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        return callback({
          code: grpc.status.ALREADY_EXISTS,
          message: error.message,
        });
      }
      logger.error({ err: error }, 'CreateExample failed');
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error',
      });
    }
  },

  ListExamples: async (
    call: grpc.ServerUnaryCall<ListExamplesRequest, any>,
    callback: grpc.sendUnaryData<any>
  ) => {
    try {
      const useCase = container.resolve<ListExamplesUseCase>(TOKENS.ListExamplesUseCase);
      const result = await useCase.execute({
        limit: call.request.limit || 20,
        offset: call.request.offset || 0,
      });

      callback(null, {
        examples: result.items.map((item) => ({
          id: item.id,
          name: item.name,
          created_at: item.createdAt.toISOString(),
          updated_at: item.updatedAt.toISOString(),
        })),
        total: result.total,
      });
    } catch (error) {
      logger.error({ err: error }, 'ListExamples failed');
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error',
      });
    }
  },

  // Streaming example
  WatchExamples: (call) => {
    // Example: Send updates every 5 seconds
    const interval = setInterval(() => {
      call.write({
        id: Date.now(),
        name: 'Live update',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }, 5000);

    call.on('cancelled', () => {
      clearInterval(interval);
    });
  },
};
```

## Step 4: Create gRPC Server

```typescript
// src/grpc/server.ts
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../infra/logger/logger.js';
import { exampleHandlers } from './handlers/exampleHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, 'protos', 'service.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const microservicePackage = protoDescriptor.microservice;

export function startGrpcServer(port: number): grpc.Server {
  const server = new grpc.Server({
    // Server options
    'grpc.max_receive_message_length': 1024 * 1024 * 10, // 10MB
    'grpc.max_send_message_length': 1024 * 1024 * 10,    // 10MB
  });

  // Register services
  server.addService(microservicePackage.ExampleService.service, exampleHandlers);

  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        logger.error({ err: error }, 'Failed to start gRPC server');
        throw error;
      }
      logger.info({ port }, 'gRPC server started');
    }
  );

  return server;
}

export function stopGrpcServer(server: grpc.Server): Promise<void> {
  return new Promise((resolve) => {
    server.tryShutdown(() => {
      logger.info('gRPC server stopped');
      resolve();
    });
  });
}
```

## Step 5: Create gRPC Client

```typescript
// src/grpc/client.ts
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, 'protos', 'service.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;

export function createExampleClient(address: string) {
  return new protoDescriptor.microservice.ExampleService(
    address,
    grpc.credentials.createInsecure(),
    {
      // Client options
      'grpc.keepalive_time_ms': 10000,
      'grpc.keepalive_timeout_ms': 5000,
      'grpc.keepalive_permit_without_calls': 1,
    }
  );
}

// Promisified client wrapper
export class ExampleServiceClient {
  private client: any;

  constructor(address: string) {
    this.client = createExampleClient(address);
  }

  getExample(id: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.GetExample({ id }, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
  }

  createExample(name: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.CreateExample({ name }, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
  }

  listExamples(limit = 20, offset = 0): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.ListExamples({ limit, offset }, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
  }

  close(): void {
    this.client.close();
  }
}
```

## Step 6: Enable in Main Entry

```typescript
// src/index.ts
import { startGrpcServer, stopGrpcServer } from './grpc/server.js';

// In main():
const grpcServer = startGrpcServer(config.GRPC_PORT);
logger.info({ port: config.GRPC_PORT }, 'gRPC server started');

// Register for graceful shutdown
gracefulShutdown.register('grpc', async () => {
  await stopGrpcServer(grpcServer);
});
```

## Best Practices

### 1. Error Handling

Map business errors to gRPC status codes:

| Business Error | gRPC Status |
|---------------|-------------|
| Not Found | `NOT_FOUND` |
| Already Exists | `ALREADY_EXISTS` |
| Invalid Input | `INVALID_ARGUMENT` |
| Unauthorized | `UNAUTHENTICATED` |
| Forbidden | `PERMISSION_DENIED` |
| Internal Error | `INTERNAL` |

### 2. Metadata (Headers)

```typescript
// Server: Read metadata
const correlationId = call.metadata.get('x-correlation-id')[0];

// Client: Send metadata
const metadata = new grpc.Metadata();
metadata.add('x-correlation-id', 'abc-123');
client.GetExample({ id: 1 }, metadata, callback);
```

### 3. Deadlines

```typescript
// Client: Set deadline
const deadline = new Date();
deadline.setSeconds(deadline.getSeconds() + 5); // 5 second timeout
client.GetExample({ id: 1 }, { deadline }, callback);
```

### 4. Health Checks

```protobuf
// Add to service.proto
service Health {
  rpc Check (HealthCheckRequest) returns (HealthCheckResponse);
}

message HealthCheckRequest {
  string service = 1;
}

message HealthCheckResponse {
  enum ServingStatus {
    UNKNOWN = 0;
    SERVING = 1;
    NOT_SERVING = 2;
  }
  ServingStatus status = 1;
}
```

## Testing gRPC

### Using grpcurl

```bash
# Install grpcurl
brew install grpcurl

# List services
grpcurl -plaintext localhost:50051 list

# Describe service
grpcurl -plaintext localhost:50051 describe microservice.ExampleService

# Call method
grpcurl -plaintext -d '{"id": 1}' localhost:50051 microservice.ExampleService/GetExample

# Create example
grpcurl -plaintext -d '{"name": "Test"}' localhost:50051 microservice.ExampleService/CreateExample
```

### Unit Testing

```typescript
// tests/grpc/exampleHandler.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('gRPC ExampleHandler', () => {
  it('should return example by id', async () => {
    // Mock the use case
    const mockUseCase = {
      execute: vi.fn().mockResolvedValue({
        id: 1,
        name: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };

    // ... test implementation
  });
});
```

## References

- [gRPC Node.js Documentation](https://grpc.io/docs/languages/node/)
- [Protocol Buffers Language Guide](https://protobuf.dev/programming-guides/proto3/)
- [Building gRPC Microservices with Node.js](https://rsbh.dev/blogs/grpc-with-nodejs-typescript)
- [High-Performance Microservices with gRPC](https://medium.com/cloud-native-daily/building-high-performance-microservices-with-node-js-grpc-and-typescript-ddef5e0bdb95)
