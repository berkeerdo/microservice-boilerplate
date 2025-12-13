/* eslint-disable max-lines */
/**
 * Resilient gRPC Client
 *
 * Production-ready base class for gRPC service clients with:
 * - Lazy connection (connect on first use, not at startup)
 * - Background reconnection with exponential backoff
 * - Health states (CONNECTED, CONNECTING, DISCONNECTED)
 * - Non-blocking startup (service starts even if dependencies are down)
 * - Automatic retry with exponential backoff
 * - Graceful degradation with fallback cache
 * - Metrics tracking (OpenTelemetry-compatible)
 *
 * @example
 * ```typescript
 * class AuthClient extends ResilientGrpcClient<AuthServiceClient> {
 *   constructor() {
 *     super({
 *       serviceName: 'AuthService',
 *       grpcUrl: 'localhost:50052',
 *       protoFile: 'auth.proto',
 *       packageName: 'lobsterlead.auth',
 *       serviceClassName: 'AuthService',
 *     });
 *   }
 *
 *   async validateToken(token: string) {
 *     return this.call('ValidateToken', { token });
 *   }
 * }
 * ```
 */
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { EventEmitter } from 'events';
import logger from '../logger/logger.js';

import {
  ConnectionState,
  DEFAULT_CONFIG,
  type ResilientClientConfig,
  type CallOptions,
  type ClientHealth,
  type ClientMetrics,
} from './types.js';
import { FallbackCache } from './FallbackCache.js';
import { MetricsTracker } from './MetricsTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Proto loader options
const PROTO_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

/**
 * Base class for resilient gRPC clients
 */
export abstract class ResilientGrpcClient<
  TClient extends grpc.Client = grpc.Client,
> extends EventEmitter {
  protected client: TClient | null = null;
  protected config: Required<ResilientClientConfig>;
  protected state: ConnectionState = ConnectionState.DISCONNECTED;
  protected reconnectAttempts = 0;
  protected reconnectTimer: NodeJS.Timeout | null = null;
  protected lastConnectedAt: Date | null = null;
  protected lastErrorAt: Date | null = null;
  protected lastError: string | null = null;
  protected lastLatencyMs = 0;
  protected connectPromise: Promise<void> | null = null;
  protected isShuttingDown = false;

  // Composition: Use separate classes for cache and metrics
  protected readonly metricsTracker: MetricsTracker;
  protected readonly fallbackCache: FallbackCache;

  constructor(config: ResilientClientConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metricsTracker = new MetricsTracker();
    this.fallbackCache = new FallbackCache(
      config.serviceName,
      this.config.maxCacheSize,
      this.config.fallbackCacheTtlMs
    );
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Ensure connection is established (lazy connection)
   * Safe to call multiple times - will only connect once
   */
  async ensureConnected(): Promise<boolean> {
    if (this.state === ConnectionState.CONNECTED && this.client) {
      return true;
    }

    if (this.connectPromise) {
      try {
        await this.connectPromise;
        return this.state === ConnectionState.CONNECTED;
      } catch {
        return false;
      }
    }

    this.connectPromise = this.connect();
    try {
      await this.connectPromise;
      return this.state === ConnectionState.CONNECTED;
    } catch {
      return false;
    } finally {
      this.connectPromise = null;
    }
  }

  /**
   * Make a gRPC call with automatic connection and retry
   */
  protected async call<TRequest, TResponse>(
    methodName: string,
    request: TRequest,
    options?: CallOptions
  ): Promise<TResponse> {
    const { timeoutMs, locale, clientUrl, skipRetry, cacheKey, skipCache } = options || {};
    const maxAttempts = skipRetry ? 1 : this.config.retryCount + 1;
    const effectiveCacheKey = cacheKey || `${methodName}:${JSON.stringify(request)}`;
    const useCache = this.config.enableFallbackCache && !skipCache;
    let lastError: Error | null = null;

    this.metricsTracker.recordCallStart();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const connected = await this.ensureConnected();
        if (!connected) {
          return this.handleServiceUnavailable<TResponse>(methodName, effectiveCacheKey, useCache);
        }

        const startTime = Date.now();
        const response = await this.executeCall<TRequest, TResponse>(methodName, request, {
          timeoutMs,
          locale,
          clientUrl,
        });

        this.lastLatencyMs = Date.now() - startTime;
        this.metricsTracker.recordSuccess(this.lastLatencyMs);

        if (useCache) {
          this.fallbackCache.set(effectiveCacheKey, response);
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.lastErrorAt = new Date();
        this.lastError = lastError.message;

        if (attempt > 0) {
          this.metricsTracker.recordRetry();
        }

        if (!this.isRetryableError(lastError) || attempt >= maxAttempts - 1) {
          break;
        }

        if (this.isConnectionError(lastError)) {
          this.handleConnectionLost();
        }

        const delay = this.config.retryDelayMs * Math.pow(2, attempt);
        logger.warn(
          {
            service: this.config.serviceName,
            method: methodName,
            attempt: attempt + 1,
            maxAttempts,
            delay,
            error: lastError.message,
          },
          'gRPC call failed, retrying...'
        );

        await this.sleep(delay);
      }
    }

    this.metricsTracker.recordFailure();

    // Try fallback cache as last resort
    if (useCache) {
      const cached = this.fallbackCache.get<TResponse>(effectiveCacheKey);
      if (cached !== null) {
        this.metricsTracker.recordCacheHit();
        logger.warn(
          { service: this.config.serviceName, method: methodName, error: lastError?.message },
          'Call failed, returning stale cached response'
        );
        return cached;
      }
      this.metricsTracker.recordCacheMiss();
    }

    throw lastError ?? new Error('Unknown gRPC error');
  }

  /**
   * Get current health status with metrics
   */
  getHealth(): ClientHealth {
    return {
      state: this.state,
      healthy: this.state === ConnectionState.CONNECTED,
      lastConnectedAt: this.lastConnectedAt,
      lastErrorAt: this.lastErrorAt,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts,
      latencyMs: this.lastLatencyMs,
      metrics: this.metricsTracker.getMetrics(),
    };
  }

  /**
   * Get metrics only (for OpenTelemetry export)
   */
  getMetrics(): ClientMetrics {
    return this.metricsTracker.getMetrics();
  }

  /**
   * Reset metrics (useful for periodic reporting)
   */
  resetMetrics(): void {
    this.metricsTracker.reset();
  }

  /**
   * Clear fallback cache
   */
  clearCache(): void {
    this.fallbackCache.clear();
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED && this.client !== null;
  }

  /**
   * Close connection and stop reconnection attempts
   */
  close(): void {
    this.isShuttingDown = true;
    this.stopReconnectTimer();

    if (this.client) {
      this.client.close();
      this.client = null;
    }

    this.state = ConnectionState.DISCONNECTED;
    this.emit('disconnected');
    logger.info({ service: this.config.serviceName }, 'gRPC client closed');
  }

  // ============================================
  // CONNECTION MANAGEMENT
  // ============================================

  private async connect(): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Client is shutting down');
    }

    this.state =
      this.reconnectAttempts > 0 ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING;
    this.emit('connecting');

    try {
      const protoPath = join(__dirname, this.config.protosPath, this.config.protoFile);
      const packageDefinition = protoLoader.loadSync(protoPath, PROTO_OPTIONS);
      const proto = grpc.loadPackageDefinition(packageDefinition);

      const packageParts = this.config.packageName.split('.');
      let current: grpc.GrpcObject = proto;
      for (const part of packageParts) {
        current = current[part] as grpc.GrpcObject;
      }
      const ServiceClass = current[this.config.serviceClassName] as grpc.ServiceClientConstructor;

      const credentials = this.config.useTls
        ? grpc.credentials.createSsl()
        : grpc.credentials.createInsecure();

      this.client = new ServiceClass(this.config.grpcUrl, credentials, {
        'grpc.keepalive_time_ms': this.config.keepaliveTimeMs,
        'grpc.keepalive_timeout_ms': this.config.keepaliveTimeoutMs,
        'grpc.keepalive_permit_without_calls': 1,
      }) as unknown as TClient;

      await this.waitForReady();

      this.state = ConnectionState.CONNECTED;
      this.lastConnectedAt = new Date();
      this.reconnectAttempts = 0;
      this.lastError = null;
      this.emit('connected');

      logger.info(
        { service: this.config.serviceName, url: this.config.grpcUrl },
        'gRPC client connected'
      );

      this.monitorConnection();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.lastErrorAt = new Date();
      this.lastError = errorMessage;
      this.state = ConnectionState.DISCONNECTED;
      this.emit('error', error);

      logger.warn(
        {
          service: this.config.serviceName,
          url: this.config.grpcUrl,
          error: errorMessage,
          reconnectAttempts: this.reconnectAttempts,
        },
        'gRPC client connection failed, will retry in background'
      );

      this.scheduleReconnect();
      throw error;
    }
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Client not initialized'));
        return;
      }

      const deadline = new Date(Date.now() + this.config.timeoutMs);
      this.client.waitForReady(deadline, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private monitorConnection(): void {
    if (!this.client) {
      return;
    }

    const channel = this.client.getChannel();
    const checkState = (): void => {
      if (this.isShuttingDown || !this.client) {
        return;
      }

      const state = channel.getConnectivityState(false);

      if (
        state === grpc.connectivityState.TRANSIENT_FAILURE ||
        state === grpc.connectivityState.SHUTDOWN
      ) {
        this.handleConnectionLost();
      } else if (state === grpc.connectivityState.READY) {
        setTimeout(checkState, 5000);
      } else {
        setTimeout(checkState, 1000);
      }
    };

    setTimeout(checkState, 5000);
  }

  private handleConnectionLost(): void {
    if (this.state !== ConnectionState.CONNECTED) {
      return;
    }

    this.state = ConnectionState.DISCONNECTED;
    this.emit('disconnected');
    logger.warn({ service: this.config.serviceName }, 'gRPC connection lost, reconnecting...');

    if (this.client) {
      try {
        this.client.close();
      } catch {
        // Ignore close errors
      }
      this.client = null;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error(
        { service: this.config.serviceName, attempts: this.reconnectAttempts },
        'Max reconnect attempts reached, giving up'
      );
      return;
    }

    const baseDelay = this.config.initialReconnectDelayMs * Math.pow(2, this.reconnectAttempts);
    const jitter = Math.random() * 1000;
    const delay = Math.min(baseDelay + jitter, this.config.maxReconnectDelayMs);

    this.reconnectAttempts++;

    logger.debug(
      {
        service: this.config.serviceName,
        attempt: this.reconnectAttempts,
        delayMs: Math.round(delay),
      },
      'Scheduling reconnect'
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        // connect() will schedule another reconnect on failure
      }
    }, delay);
  }

  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ============================================
  // CALL EXECUTION
  // ============================================

  private executeCall<TRequest, TResponse>(
    methodName: string,
    request: TRequest,
    options: { timeoutMs?: number; locale?: string; clientUrl?: string }
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error(`${this.config.serviceName} client not connected`));
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const method = (this.client as unknown as Record<string, (...args: any[]) => void>)[
        methodName
      ];

      if (!method) {
        reject(new Error(`Method ${methodName} not found on ${this.config.serviceName}`));
        return;
      }

      const timeout = options.timeoutMs ?? this.config.timeoutMs;
      const deadline = new Date(Date.now() + timeout);

      const metadata = new grpc.Metadata();
      if (options.locale) {
        metadata.set('accept-language', options.locale);
      }
      if (options.clientUrl) {
        metadata.set('x-client-url', options.clientUrl);
      }

      method.call(
        this.client,
        request,
        metadata,
        { deadline },
        (error: grpc.ServiceError | null, response: TResponse) => {
          if (error) {
            reject(this.mapGrpcError(error));
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  // ============================================
  // HELPERS
  // ============================================

  private handleServiceUnavailable<TResponse>(
    methodName: string,
    cacheKey: string,
    useCache: boolean
  ): TResponse {
    if (useCache) {
      const cached = this.fallbackCache.get<TResponse>(cacheKey);
      if (cached !== null) {
        this.metricsTracker.recordCacheHit();
        logger.info(
          { service: this.config.serviceName, method: methodName },
          'Service unavailable, returning cached response'
        );
        return cached;
      }
      this.metricsTracker.recordCacheMiss();
    }
    throw new Error(`${this.config.serviceName} is not available`);
  }

  private isRetryableError(error: Error): boolean {
    const grpcError = error as grpc.ServiceError;
    const retryableCodes = [
      grpc.status.UNAVAILABLE,
      grpc.status.DEADLINE_EXCEEDED,
      grpc.status.RESOURCE_EXHAUSTED,
      grpc.status.ABORTED,
    ];
    return retryableCodes.includes(grpcError.code);
  }

  private isConnectionError(error: Error): boolean {
    const grpcError = error as grpc.ServiceError;
    return grpcError.code === grpc.status.UNAVAILABLE;
  }

  private mapGrpcError(error: grpc.ServiceError): Error {
    const mappedError = new Error(error.details || error.message);
    (mappedError as Error & { code: number }).code = error.code;
    (mappedError as Error & { grpcCode: number }).grpcCode = error.code;
    return mappedError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Increment circuit breaker trip count (call from subclass)
   */
  protected incrementCircuitBreakerTrips(): void {
    this.metricsTracker.recordCircuitBreakerTrip();
    this.emit('circuitBreakerTrip', this.config.serviceName);
  }
}

export default ResilientGrpcClient;
