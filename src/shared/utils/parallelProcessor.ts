/**
 * Parallel Processor Utility
 *
 * Generic utilities for parallel processing with controlled concurrency.
 * Supports batch processing and parallel execution with error handling.
 *
 * @module shared/utils/parallelProcessor
 */

// ============================================
// TYPES
// ============================================

/**
 * Options for parallel processing
 */
export interface ParallelProcessorOptions {
  /** Maximum concurrent operations (default: 5) */
  concurrency?: number;
  /** Continue processing on individual failures (default: true) */
  continueOnError?: boolean;
}

/**
 * Result wrapper for error handling
 */
export interface ProcessResult<T> {
  success: boolean;
  value?: T;
  error?: Error;
  index: number;
}

// ============================================
// BATCH UTILITIES
// ============================================

/**
 * Split items into batches of specified size.
 *
 * @example
 * ```typescript
 * const items = [1, 2, 3, 4, 5, 6, 7];
 * const batches = createBatches(items, 3);
 * // Result: [[1, 2, 3], [4, 5, 6], [7]]
 * ```
 */
export function createBatches<T>(items: T[], batchSize: number): T[][] {
  if (batchSize <= 0) {
    throw new Error('Batch size must be greater than 0');
  }

  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

// ============================================
// BATCH PROCESSING
// ============================================

/**
 * Process items in sequential batches.
 * Each batch is processed in parallel, then waits before starting the next batch.
 *
 * @example
 * ```typescript
 * const serviceIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
 * const results = await processBatches(
 *   serviceIds,
 *   async (id) => fetchServiceData(id),
 *   5 // Process 5 at a time
 * );
 * ```
 */
export async function processBatches<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number
): Promise<R[]> {
  const results: R[] = [];
  const batches = createBatches(items, batchSize);

  for (const batch of batches) {
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
}

/**
 * Process items in sequential batches with error handling.
 * Returns ProcessResult for each item, allowing partial failures.
 *
 * @example
 * ```typescript
 * const results = await processBatchesWithResults(
 *   serviceIds,
 *   async (id) => fetchServiceData(id),
 *   5
 * );
 *
 * const successful = results.filter(r => r.success);
 * const failed = results.filter(r => !r.success);
 * ```
 */
export async function processBatchesWithResults<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number
): Promise<ProcessResult<R>[]> {
  const results: ProcessResult<R>[] = [];
  const batches = createBatches(items, batchSize);

  let globalIndex = 0;
  for (const batch of batches) {
    const batchPromises = batch.map(async (item, localIndex) => {
      const index = globalIndex + localIndex;
      try {
        const value = await processor(item);
        return { success: true, value, index } as ProcessResult<R>;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          index,
        } as ProcessResult<R>;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    globalIndex += batch.length;
  }

  return results;
}

// ============================================
// CONCURRENT PROCESSING
// ============================================

/**
 * Process items with controlled concurrency using a sliding window.
 * Unlike batch processing, this starts a new task as soon as one completes.
 *
 * This provides better throughput when tasks have varying completion times.
 *
 * @example
 * ```typescript
 * const results = await processWithConcurrency(
 *   serviceIds,
 *   async (id) => fetchServiceData(id),
 *   { concurrency: 5 }
 * );
 * ```
 */
export async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: ParallelProcessorOptions = {}
): Promise<R[]> {
  const { concurrency = 5 } = options;

  if (items.length === 0) {
    return [];
  }

  // Use Map for safe index-based storage (avoids object injection)
  const resultsMap = new Map<number, R>();
  let currentIndex = 0;
  const executing: Promise<void>[] = [];

  const executeNext = async (): Promise<void> => {
    if (currentIndex >= items.length) {
      return;
    }

    const index = currentIndex++;
    const item = items.at(index);

    if (item !== undefined) {
      const result = await processor(item);
      resultsMap.set(index, result);
    }
  };

  // Start initial batch of concurrent tasks
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    executing.push(executeNext());
  }

  // Process remaining items as tasks complete
  while (currentIndex < items.length) {
    await Promise.race(executing);

    // Remove completed promises and add new ones
    for (const [idx, promise] of executing.entries()) {
      const isSettled = await Promise.race([promise.then(() => true), Promise.resolve(false)]);
      if (isSettled) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        executing.splice(idx, 1);
        if (currentIndex < items.length) {
          executing.push(executeNext());
        }
        break;
      }
    }
  }

  // Wait for all remaining tasks to complete
  await Promise.all(executing);

  // Convert Map to array in order
  return Array.from({ length: items.length }, (_, i) => resultsMap.get(i) as R);
}

/**
 * Process items with controlled concurrency, with error handling.
 * Returns ProcessResult for each item, allowing partial failures.
 *
 * @example
 * ```typescript
 * const results = await processWithConcurrencyResults(
 *   serviceIds,
 *   async (id) => fetchServiceData(id),
 *   { concurrency: 5, continueOnError: true }
 * );
 * ```
 */
export async function processWithConcurrencyResults<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: ParallelProcessorOptions = {}
): Promise<ProcessResult<R>[]> {
  const { concurrency = 5, continueOnError = true } = options;

  if (items.length === 0) {
    return [];
  }

  // Use Map for safe index-based storage (avoids object injection)
  const resultsMap = new Map<number, ProcessResult<R>>();
  let currentIndex = 0;

  const safeProcessor = async (item: T, index: number): Promise<void> => {
    try {
      const value = await processor(item);
      resultsMap.set(index, { success: true, value, index });
    } catch (error) {
      resultsMap.set(index, {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        index,
      });
      if (!continueOnError) {
        throw error;
      }
    }
  };

  const batches = createBatches(items, concurrency);

  for (const batch of batches) {
    const batchPromises = batch.map((item, localIndex) => {
      const index = currentIndex + localIndex;
      return safeProcessor(item, index);
    });

    await Promise.all(batchPromises);
    currentIndex += batch.length;
  }

  // Convert Map to array in order
  const results: ProcessResult<R>[] = [];
  for (let i = 0; i < items.length; i++) {
    const result = resultsMap.get(i);
    if (result !== undefined) {
      results.push(result);
    }
  }
  return results;
}

// ============================================
// AGGREGATION UTILITIES
// ============================================

/**
 * Aggregate ProcessResults into a summary
 */
export function aggregateResults<T>(results: ProcessResult<T>[]): {
  successful: T[];
  failed: { error: Error; index: number }[];
  successCount: number;
  failureCount: number;
} {
  const successful: T[] = [];
  const failed: { error: Error; index: number }[] = [];

  for (const result of results) {
    if (result.success && result.value !== undefined) {
      successful.push(result.value);
    } else if (result.error) {
      failed.push({ error: result.error, index: result.index });
    }
  }

  return {
    successful,
    failed,
    successCount: successful.length,
    failureCount: failed.length,
  };
}
