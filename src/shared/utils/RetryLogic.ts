import logger from '../../infra/logger/logger.js';

/**
 * Retry Options
 */
interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Default retry options
 */
const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  return Math.min(exponentialDelay + jitter, options.maxDelayMs);
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  operationName = 'operation'
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxRetries) {
        logger.error(
          {
            operation: operationName,
            attempt: attempt + 1,
            maxRetries: opts.maxRetries + 1,
            error: lastError.message,
          },
          `${operationName} failed after ${attempt + 1} attempts`
        );
        break;
      }

      const delay = calculateDelay(attempt, opts);
      logger.warn(
        {
          operation: operationName,
          attempt: attempt + 1,
          nextRetryIn: delay,
          error: lastError.message,
        },
        `${operationName} failed, retrying in ${delay}ms`
      );

      await sleep(delay);
    }
  }

  throw lastError ?? new Error(`${operationName} failed`);
}

/**
 * Retry with custom error filter
 * Only retries if the error matches the filter
 */
export async function retryOnError<T>(
  fn: () => Promise<T>,
  errorFilter: (error: Error) => boolean,
  options: Partial<RetryOptions> = {},
  operationName = 'operation'
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if error doesn't match filter
      if (!errorFilter(lastError)) {
        throw lastError ?? new Error(`${operationName} failed`);
      }

      if (attempt === opts.maxRetries) {
        logger.error(
          {
            operation: operationName,
            attempt: attempt + 1,
            error: lastError.message,
          },
          `${operationName} failed after ${attempt + 1} attempts`
        );
        break;
      }

      const delay = calculateDelay(attempt, opts);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error(`${operationName} failed`);
}
