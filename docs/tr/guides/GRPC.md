# gRPC Rehberi

Bu rehber, servisler arası iletişim için gRPC servislerinin nasıl implement edileceğini açıklar.

## Neden gRPC?

| Özellik | REST | gRPC |
|---------|------|------|
| Protokol | HTTP/1.1 | HTTP/2 |
| Payload | JSON (metin) | Protocol Buffers (binary) |
| Performans | Baseline | ~7-10x daha hızlı |
| Tip Güvenliği | Manuel (OpenAPI) | Yerleşik (Proto) |
| Streaming | Sınırlı | Tam duplex |
| Kod Üretimi | Opsiyonel | Native |

**gRPC Kullanın:**
- Servisler arası iletişim (internal)
- Yüksek performans gerektiğinde
- Güçlü tipleme gerektiğinde
- Çift yönlü streaming

**REST Kullanın:**
- Public API'lar (browser client'ları)
- Basit CRUD operasyonları
- Caching önemli olduğunda (HTTP caching)

## Proje Yapısı

```
src/grpc/
├── protos/           # Protocol Buffer tanımları
│   └── service.proto
├── handlers/         # RPC metod implementasyonları
│   └── exampleHandler.ts
├── server.ts         # gRPC sunucu kurulumu
└── client.ts         # gRPC client factory
```

## Adım 1: Protocol Buffer Tanımları

```protobuf
// src/grpc/protos/service.proto
syntax = "proto3";

package microservice;

service ExampleService {
  rpc GetExample (GetExampleRequest) returns (ExampleResponse);
  rpc CreateExample (CreateExampleRequest) returns (ExampleResponse);
  rpc ListExamples (ListExamplesRequest) returns (ListExamplesResponse);

  // Streaming örneği
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
  // Şimdilik boş
}
```

## Adım 2: TypeScript Tipleri Üretme

proto-loader'ı tip üretimi için yükleyin:

```bash
npm install @grpc/proto-loader
```

Tipleri üretin:

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

`package.json`'a ekleyin:

```json
{
  "scripts": {
    "proto:generate": "proto-loader-gen-types --longs=String --enums=String --defaults --oneofs --grpcLib=@grpc/grpc-js --outDir=src/grpc/generated src/grpc/protos/*.proto"
  }
}
```

## Adım 3: Handler'ları Implement Etme

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

// Üretilen tipleri import et
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
          message: `${call.request.id} id'li örnek bulunamadı`,
        });
      }

      callback(null, {
        id: result.id,
        name: result.name,
        created_at: result.createdAt.toISOString(),
        updated_at: result.updatedAt.toISOString(),
      });
    } catch (error) {
      logger.error({ err: error }, 'GetExample başarısız');
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
      logger.error({ err: error }, 'CreateExample başarısız');
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
      logger.error({ err: error }, 'ListExamples başarısız');
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error',
      });
    }
  },

  // Streaming örneği
  WatchExamples: (call) => {
    // Örnek: Her 5 saniyede bir güncelleme gönder
    const interval = setInterval(() => {
      call.write({
        id: Date.now(),
        name: 'Canlı güncelleme',
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

## Adım 4: gRPC Sunucu Oluşturma

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
    // Sunucu ayarları
    'grpc.max_receive_message_length': 1024 * 1024 * 10, // 10MB
    'grpc.max_send_message_length': 1024 * 1024 * 10,    // 10MB
  });

  // Servisleri kaydet
  server.addService(microservicePackage.ExampleService.service, exampleHandlers);

  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        logger.error({ err: error }, 'gRPC sunucusu başlatılamadı');
        throw error;
      }
      logger.info({ port }, 'gRPC sunucusu başlatıldı');
    }
  );

  return server;
}

export function stopGrpcServer(server: grpc.Server): Promise<void> {
  return new Promise((resolve) => {
    server.tryShutdown(() => {
      logger.info('gRPC sunucusu durduruldu');
      resolve();
    });
  });
}
```

## Adım 5: gRPC Client Oluşturma

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
      // Client ayarları
      'grpc.keepalive_time_ms': 10000,
      'grpc.keepalive_timeout_ms': 5000,
      'grpc.keepalive_permit_without_calls': 1,
    }
  );
}

// Promise tabanlı client wrapper
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

## Adım 6: Ana Entry Point'te Aktifleştirme

```typescript
// src/index.ts
import { startGrpcServer, stopGrpcServer } from './grpc/server.js';

// main() içinde:
const grpcServer = startGrpcServer(config.GRPC_PORT);
logger.info({ port: config.GRPC_PORT }, 'gRPC sunucusu başlatıldı');

// Graceful shutdown için kaydet
gracefulShutdown.register('grpc', async () => {
  await stopGrpcServer(grpcServer);
});
```

## En İyi Pratikler

### 1. Hata Yönetimi

Business hataları gRPC status kodlarına eşleyin:

| Business Hatası | gRPC Status |
|----------------|-------------|
| Bulunamadı | `NOT_FOUND` |
| Zaten Var | `ALREADY_EXISTS` |
| Geçersiz Girdi | `INVALID_ARGUMENT` |
| Yetkisiz | `UNAUTHENTICATED` |
| Yasaklı | `PERMISSION_DENIED` |
| Internal Hata | `INTERNAL` |

### 2. Metadata (Header'lar)

```typescript
// Sunucu: Metadata oku
const correlationId = call.metadata.get('x-correlation-id')[0];

// Client: Metadata gönder
const metadata = new grpc.Metadata();
metadata.add('x-correlation-id', 'abc-123');
client.GetExample({ id: 1 }, metadata, callback);
```

### 3. Deadline'lar

```typescript
// Client: Deadline ayarla
const deadline = new Date();
deadline.setSeconds(deadline.getSeconds() + 5); // 5 saniye timeout
client.GetExample({ id: 1 }, { deadline }, callback);
```

### 4. Health Check'ler

```protobuf
// service.proto'ya ekle
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

## gRPC Test Etme

### grpcurl Kullanımı

```bash
# grpcurl yükle
brew install grpcurl

# Servisleri listele
grpcurl -plaintext localhost:50051 list

# Servisi tanımla
grpcurl -plaintext localhost:50051 describe microservice.ExampleService

# Metod çağır
grpcurl -plaintext -d '{"id": 1}' localhost:50051 microservice.ExampleService/GetExample

# Örnek oluştur
grpcurl -plaintext -d '{"name": "Test"}' localhost:50051 microservice.ExampleService/CreateExample
```

### Unit Test

```typescript
// tests/grpc/exampleHandler.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('gRPC ExampleHandler', () => {
  it('id ile örnek dönmeli', async () => {
    // Use case'i mockla
    const mockUseCase = {
      execute: vi.fn().mockResolvedValue({
        id: 1,
        name: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };

    // ... test implementasyonu
  });
});
```

## Kaynaklar

- [gRPC Node.js Dökümantasyonu](https://grpc.io/docs/languages/node/)
- [Protocol Buffers Dil Rehberi](https://protobuf.dev/programming-guides/proto3/)
- [Node.js ile gRPC Microservices](https://rsbh.dev/blogs/grpc-with-nodejs-typescript)
- [gRPC ile Yüksek Performanslı Microservices](https://medium.com/cloud-native-daily/building-high-performance-microservices-with-node-js-grpc-and-typescript-ddef5e0bdb95)
