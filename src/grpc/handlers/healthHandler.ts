/**
 * gRPC Health Check Handler
 * Implements the standard gRPC health checking protocol for Kubernetes
 * See: https://github.com/grpc/grpc/blob/master/doc/health-checking.md
 */
import * as grpc from '@grpc/grpc-js';
import { HealthService } from '../../infra/health/HealthService.js';
import logger from '../../infra/logger/logger.js';

/**
 * Serving status enum matching proto definition
 */
enum ServingStatus {
  UNKNOWN = 0,
  SERVING = 1,
  NOT_SERVING = 2,
  SERVICE_UNKNOWN = 3,
}

interface HealthCheckRequest {
  service: string;
}

interface HealthCheckResponse {
  status: ServingStatus;
}

type HealthCheckCallback = (
  error: grpc.ServiceError | null,
  response?: HealthCheckResponse
) => void;

/**
 * Map of service names to their health check functions
 * Empty string = overall server health
 */
const serviceHealthChecks: Map<string, () => ServingStatus> = new Map([
  // Overall server health (empty service name)
  [
    '',
    () => {
      const health = HealthService.check();
      return health.status === 'healthy' ? ServingStatus.SERVING : ServingStatus.NOT_SERVING;
    },
  ],
  // Specific service checks can be added here
  ['microservice.ExampleService', () => ServingStatus.SERVING],
]);

/**
 * Check - Unary health check
 */
function check(
  call: grpc.ServerUnaryCall<HealthCheckRequest, HealthCheckResponse>,
  callback: HealthCheckCallback
): void {
  const { service } = call.request;

  logger.debug({ service }, 'gRPC health check requested');

  const healthCheck = serviceHealthChecks.get(service);

  if (!healthCheck) {
    // Unknown service
    callback(null, { status: ServingStatus.SERVICE_UNKNOWN });
    return;
  }

  try {
    const status = healthCheck();
    callback(null, { status });
  } catch (error) {
    logger.error({ err: error, service }, 'Health check failed');
    callback(null, { status: ServingStatus.NOT_SERVING });
  }
}

/**
 * Watch - Streaming health check (for long-polling clients)
 */
function watch(call: grpc.ServerWritableStream<HealthCheckRequest, HealthCheckResponse>): void {
  const { service } = call.request;

  logger.debug({ service }, 'gRPC health watch started');

  const healthCheck = serviceHealthChecks.get(service);

  if (!healthCheck) {
    call.write({ status: ServingStatus.SERVICE_UNKNOWN });
    call.end();
    return;
  }

  // Send initial status
  const initialStatus = healthCheck();
  call.write({ status: initialStatus });

  // For simplicity, we just send the current status and end
  // In a more complex implementation, you'd keep the stream open
  // and send updates when health status changes
  call.end();
}

/**
 * Register a custom service health check
 */
export function registerServiceHealthCheck(serviceName: string, check: () => ServingStatus): void {
  serviceHealthChecks.set(serviceName, check);
}

/**
 * Export handlers matching the Health service definition
 */
export const healthServiceHandlers = {
  Check: check,
  Watch: watch,
};

export { ServingStatus };
