import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), ".cache");

interface CacheEnvelope<T> {
  cachedAt: number;
  data: T;
}

function cacheFilePath(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return path.join(CACHE_DIR, `${safeKey}.json`);
}

function readCache<T>(key: string, ttlMs: number): T | null {
  const filePath = cacheFilePath(key);
  if (!existsSync(filePath)) return null;

  try {
    const envelope: CacheEnvelope<T> = JSON.parse(readFileSync(filePath, "utf-8"));
    const age = Date.now() - envelope.cachedAt;
    if (age > ttlMs) return null;
    return envelope.data;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  const envelope: CacheEnvelope<T> = { cachedAt: Date.now(), data };
  writeFileSync(cacheFilePath(key), JSON.stringify(envelope), "utf-8");
}

/**
 * Zwraca dane z cache'a jeśli są świeższe niż ttlMs, w przeciwnym razie
 * wywołuje fetchFn, zapisuje wynik do cache'a na dysku i go zwraca.
 * Cache jest per-proces trwały (pliki w .cache/), więc działa też między
 * kolejnymi uruchomieniami skryptu (np. runScreener odpalany ręcznie kilka
 * razy dziennie) — to kluczowe przy dziennych limitach darmowych API.
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetchFn: () => Promise<T>
): Promise<{ data: T; fromCache: boolean }> {
  const cached = readCache<T>(key, ttlMs);
  if (cached !== null) {
    return { data: cached, fromCache: true };
  }
  const data = await fetchFn();
  writeCache(key, data);
  return { data, fromCache: false };
}

export const CACHE_TTL = {
  ONE_MINUTE: 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
} as const;
