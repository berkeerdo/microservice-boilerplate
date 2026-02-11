/**
 * BaseAPIClient
 *
 * Abstract base class for external API clients.
 * Provides common functionality:
 * - API key validation
 * - Request timing with OperationTimer
 * - Error handling patterns
 * - Circuit breaker protection
 *
 * Usage:
 * ```typescript
 * class MyAPIClient extends BaseAPIClient {
 *   protected getClientName(): string { return 'MyAPI'; }
 *   protected getApiKeyEnvVar(): string { return 'MY_API_KEY'; }
 * }
 * ```
 */
import logger from '../logger/logger.js';
import config from '../../config/env.js';
import { ExternalServiceError } from '../../shared/errors/index.js';
import { startTimer, type OperationTimer } from '../../shared/utils/index.js';
import { APICircuitBreaker, type APICircuitBreakerConfig } from './APICircuitBreaker.js';

// ============================================
// TYPES
// ============================================

export interface APIClientResponse<T> {
  success: boolean;
  data?: T;
  creditsUsed: number;
  cost: number;
  error?: string;
  requestId?: string;
  durationMs?: number;
}

// ============================================
// BASE API CLIENT
// ============================================

export abstract class BaseAPIClient {
  protected readonly apiKey: string;
  private circuitBreaker: APICircuitBreaker | null = null;

  constructor() {
    const envVar = this.getApiKeyEnvVar();
    const configMap = new Map(
      Object.entries(config as unknown as Record<string, string | undefined>)
    );
    this.apiKey = configMap.get(envVar) || '';

    if (!this.apiKey) {
      logger.warn(
        { client: this.getClientName(), envVar },
        `${this.getClientName()} API key not configured (${envVar})`
      );
    }

    // Initialize circuit breaker if configured
    const cbConfig = this.getCircuitBreakerConfig();
    if (cbConfig) {
      this.circuitBreaker = new APICircuitBreaker(cbConfig);
    }
  }

  // ============================================
  // ABSTRACT METHODS
  // ============================================

  /**
   * Get the client name for logging
   */
  protected abstract getClientName(): string;

  /**
   * Get the environment variable name for the API key
   */
  protected abstract getApiKeyEnvVar(): string;

  // ============================================
  // OPTIONAL OVERRIDES
  // ============================================

  /**
   * Get circuit breaker configuration (optional - return null to disable)
   * Override in subclasses to enable circuit breaker for the API client.
   */
  protected getCircuitBreakerConfig():
    | (Partial<APICircuitBreakerConfig> & { provider: string })
    | null {
    return null;
  }

  // ============================================
  // API KEY VALIDATION
  // ============================================

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get error response for unconfigured client
   */
  protected getUnconfiguredError<T>(): APIClientResponse<T> {
    return {
      success: false,
      creditsUsed: 0,
      cost: 0,
      error: `${this.getClientName()} API key not configured`,
    };
  }

  // ============================================
  // HTTP HELPERS
  // ============================================

  /**
   * Make an authenticated HTTP request
   */
  protected async makeRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
    let optionHeaders: Record<string, string> | undefined;
    if (options.headers instanceof Headers) {
      const headerMap = new Map<string, string>();
      options.headers.forEach((value, key) => {
        headerMap.set(key, value);
      });
      optionHeaders = Object.fromEntries(headerMap);
    } else if (options.headers) {
      optionHeaders = options.headers as Record<string, string>;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
        ...optionHeaders,
      },
    });

    if (!response.ok) {
      throw new ExternalServiceError(
        this.getClientName(),
        `API error: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Get authentication headers (can be overridden for different auth methods)
   */
  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Basic ${this.apiKey}`,
    };
  }

  // ============================================
  // TIMING & LOGGING HELPERS
  // ============================================

  /**
   * Create a timer for request duration tracking
   */
  protected createTimer(): OperationTimer {
    return startTimer();
  }

  /**
   * Log successful request
   */
  protected logSuccess(
    operation: string,
    context: Record<string, unknown>,
    durationMs: number
  ): void {
    logger.info(
      { client: this.getClientName(), operation, ...context, durationMs },
      `${this.getClientName()} ${operation} completed`
    );
  }

  /**
   * Log failed request
   */
  protected logError(operation: string, error: unknown, context?: Record<string, unknown>): void {
    logger.error(
      { client: this.getClientName(), operation, err: error, ...context },
      `${this.getClientName()} ${operation} failed`
    );
  }

  // ============================================
  // RESPONSE BUILDERS
  // ============================================

  /**
   * Build success response
   */
  protected buildSuccessResponse<T>(
    data: T,
    creditsUsed: number,
    cost: number,
    durationMs?: number,
    requestId?: string
  ): APIClientResponse<T> {
    return {
      success: true,
      data,
      creditsUsed,
      cost,
      durationMs,
      requestId,
    };
  }

  /**
   * Build error response
   */
  protected buildErrorResponse<T>(error: unknown, durationMs?: number): APIClientResponse<T> {
    return {
      success: false,
      creditsUsed: 0,
      cost: 0,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    };
  }

  // ============================================
  // CIRCUIT BREAKER
  // ============================================

  /**
   * Execute an async operation with circuit breaker protection.
   * Guards the request before execution, records success/failure after.
   *
   * @throws CircuitBreakerOpenError if circuit is OPEN
   */
  protected async executeWithCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.circuitBreaker) {
      return fn();
    }

    this.circuitBreaker.guardRequest();

    try {
      const result = await fn();
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      throw error;
    }
  }

  /**
   * Get circuit breaker stats for monitoring/health checks
   */
  getCircuitBreakerStats(): ReturnType<APICircuitBreaker['getStats']> | null {
    return this.circuitBreaker?.getStats() ?? null;
  }
}
