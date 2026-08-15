/** Helpers assíncronos: retry com backoff e debounce. */

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  onRetry?: (attempt: number, error: unknown) => void;
  /** Predicado opcional: só retenta se retornar true. */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Executa uma função async com retry + backoff exponencial.
 * Lança o último erro após esgotar tentativas.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const {
    maxAttempts,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    factor = 2,
    onRetry,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error)) break;
      const delay = Math.min(baseDelayMs * Math.pow(factor, attempt - 1), maxDelayMs);
      if (onRetry) onRetry(attempt, error);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/** Executa promises em lotes limitados de concorrência. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
