function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  isRetryable?: (error: unknown) => boolean;
}

/** Prosty exponential backoff dla wywołań, które mogą dostać 429/5xx z darmowych API. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelayMs = 500, isRetryable = defaultIsRetryable }: RetryOptions = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryable(error)) {
        throw error;
      }
      const delay = baseDelayMs * 2 ** attempt;
      await sleep(delay);
    }
  }
  throw lastError;
}

export function defaultIsRetryable(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === undefined) return true; // błąd sieciowy, warto ponowić
  return status === 429 || status >= 500;
}
