/**
 * gRPC Server Setup
 * Provides high-performance RPC communication between microservices
 */
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../infra/logger/logger.js';
import { exampleServiceHandlers } from './handlers/exampleHandler.js';
import { healthServiceHandlers } from './handlers/healthHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Proto loader options for optimal performance
const PROTO_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

let server: grpc.Server | null = null;

/**
 * Load proto file and create gRPC service definition
 */
function loadProtoDefinition(protoFile: string): grpc.GrpcObject {
  const PROTO_PATH = join(__dirname, 'protos', protoFile);
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, PROTO_OPTIONS);
  return grpc.loadPackageDefinition(packageDefinition);
}

/**
 * Start gRPC server on specified port
 */
export async function startGrpcServer(port: number): Promise<grpc.Server> {
  return new Promise((resolve, reject) => {
    try {
      // Load service proto
      const serviceProto = loadProtoDefinition('service.proto');
      const microservicePackage = serviceProto.microservice as grpc.GrpcObject;
      const ExampleService = microservicePackage.ExampleService as grpc.ServiceClientConstructor;

      // Load health proto (standard gRPC health checking protocol)
      const healthProto = loadProtoDefinition('health.proto');
      const healthPackage = (healthProto.grpc as grpc.GrpcObject).health as grpc.GrpcObject;
      const v1Package = healthPackage.v1 as grpc.GrpcObject;
      const HealthService = v1Package.Health as grpc.ServiceClientConstructor;

      server = new grpc.Server();

      // Register service handlers
      server.addService(ExampleService.service, exampleServiceHandlers);

      // Register health check service (for Kubernetes gRPC probes)
      server.addService(HealthService.service, healthServiceHandlers);

      // Bind server to port
      server.bindAsync(
        `0.0.0.0:${port}`,
        grpc.ServerCredentials.createInsecure(),
        (error, boundPort) => {
          if (error) {
            logger.error({ err: error, port }, 'Failed to bind gRPC server');
            reject(error);
            return;
          }

          logger.info({ port: boundPort }, 'gRPC server bound successfully');
          resolve(server!);
        }
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to start gRPC server');
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Stop gRPC server gracefully
 */
export async function stopGrpcServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    server.tryShutdown((error) => {
      if (error) {
        logger.warn({ err: error }, 'gRPC server graceful shutdown failed, forcing...');
        server?.forceShutdown();
      }
      logger.info('gRPC server stopped');
      server = null;
      resolve();
    });
  });
}

/**
 * Get current server instance (for testing)
 */
export function getGrpcServer(): grpc.Server | null {
  return server;
}
