import axios from "axios";
import { env } from "../config/env";
import { CACHE_TTL, withCache } from "./cache";
import { withRetry } from "./httpRetry";
import { createMinIntervalLimiter } from "./rateLimiter";

const BASE_URL = "https://finnhub.io/api/v1";

// Free tier: 60 req/min. Trzymamy min. odstęp między requestami z marginesem
// bezpieczeństwa, żeby nie oberwać 429 przy większym watchliście.
const throttle = createMinIntervalLimiter(1100);

export let finnhubRequestCount = 0;

async function finnhubGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  if (!env.finnhubApiKey) {
    throw new Error("FINNHUB_API_KEY nie jest ustawiony w backend/.env");
  }
  finnhubRequestCount++;
  return withRetry(async () => {
    await throttle();
    const response = await axios.get<T>(`${BASE_URL}${path}`, {
      params: { ...params, token: env.finnhubApiKey },
      timeout: 10_000,
    });
    return response.data;
  });
}

export interface FinnhubQuote {
  c: number; // current price
  h: number; // day high
  l: number; // day low
  o: number; // day open
  pc: number; // previous close
  d: number | null; // change
  dp: number | null; // percent change
  t: number; // timestamp
}

/** Aktualna wycena spółki (real-time-ish, opóźnienie zależne od giełdy). */
export async function getQuote(symbol: string): Promise<FinnhubQuote> {
  const { data } = await withCache(
    `finnhub:quote:${symbol}`,
    CACHE_TTL.ONE_MINUTE,
    () => finnhubGet<FinnhubQuote>("/quote", { symbol })
  );
  return data;
}

export interface FinnhubNewsItem {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  related: string;
  source: string;
  summary: string;
  url: string;
}

/**
 * News firmowy z ostatnich dni — potrzebny w Warstwie 3 (klasyfikacja przyczyny
 * spadku przez Claude), obecnie tylko przygotowane pod przyszłe użycie.
 */
export async function getCompanyNews(
  symbol: string,
  from: string,
  to: string
): Promise<FinnhubNewsItem[]> {
  const { data } = await withCache(
    `finnhub:news:${symbol}:${from}:${to}`,
    CACHE_TTL.ONE_HOUR,
    () => finnhubGet<FinnhubNewsItem[]>("/company-news", { symbol, from, to })
  );
  return data;
}

export interface FinnhubInsiderTransaction {
  name: string;
  share: number;
  change: number;
  filingDate: string;
  transactionDate: string;
  transactionCode: string; // "P" = zakup na rynku otwartym, "S" = sprzedaż, "A"/"M"/"G" itd.
  transactionPrice: number;
  isDerivative: boolean;
}

/**
 * Transakcje insiderów (SEC Form 4). Zweryfikowane empirycznie 2026-09-08 —
 * dostępne na darmowym planie. Używane przez strategię insiderAccumulation.
 */
export async function getInsiderTransactions(symbol: string): Promise<FinnhubInsiderTransaction[]> {
  const { data } = await withCache(
    `finnhub:insider-transactions:${symbol}`,
    CACHE_TTL.ONE_DAY,
    () => finnhubGet<{ data: FinnhubInsiderTransaction[] }>("/stock/insider-transactions", { symbol })
  );
  return data.data ?? [];
}
