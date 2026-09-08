/**
 * Kolejka wymuszająca minimalny odstęp między startami requestów, nawet gdy
 * wołający strzelają współbieżnie (np. Promise.all) — sam `Date.now()` bez
 * kolejki nie serializuje poprawnie równoległych wywołań.
 */
export function createMinIntervalLimiter(minIntervalMs: number): () => Promise<void> {
  let lastStartedAt = 0;
  let queue: Promise<void> = Promise.resolve();

  return function throttle(): Promise<void> {
    const next = queue.then(async () => {
      const elapsed = Date.now() - lastStartedAt;
      if (elapsed < minIntervalMs) {
        await new Promise((resolve) => setTimeout(resolve, minIntervalMs - elapsed));
      }
      lastStartedAt = Date.now();
    });
    queue = next;
    return next;
  };
}
