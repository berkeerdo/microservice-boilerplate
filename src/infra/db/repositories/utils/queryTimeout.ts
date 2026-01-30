/**
 * Query timeout utilities
 * Provides timeout wrapping for database queries
 */

/**
 * Query timeout error - thrown when a query exceeds its timeout
 */
export class QueryTimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Result with timing information
 */
export interface TimedResult<T> {
  result: T;
  durationMs: number;
}

/**
 * Wrap a promise with a timeout and return duration
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Error message if timeout occurs
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<TimedResult<T>> {
  let timeoutId: NodeJS.Timeout | undefined;
  const startTime = Date.now();

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new QueryTimeoutError(errorMessage, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return {
      result,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    throw error;
  }
}
