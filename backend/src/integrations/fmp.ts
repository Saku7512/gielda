import axios from "axios";
import { env } from "../config/env";
import { CACHE_TTL, withCache } from "./cache";
import { defaultIsRetryable, withRetry } from "./httpRetry";
import { createMinIntervalLimiter } from "./rateLimiter";

// Poszczególne warstwy scoringu odpalają po kilka zapytań do FMP współbieżnie
// (Promise.all) — bez pacingu darmowy plan FMP potrafi odrzucić burst 429,
// mimo że dzienny limit 250 nie został jeszcze wyczerpany.
const throttle = createMinIntervalLimiter(350);

// FMP wycofał legacy endpointy /api/v3/* dla kont bez subskrypcji sprzed
// 31.08.2025 (zwracają 403 "Legacy Endpoint"). Aktualne, darmowe API to
// /stable/*, które przyjmuje ticker jako query param `symbol`, a nie
// segment ścieżki.
const BASE_URL = "https://financialmodelingprep.com/stable";

export class FmpQuotaError extends Error {
  constructor(symbol: string) {
    super(
      `FMP: dzienny limit zapytań (250/dzień na darmowym planie) prawdopodobnie wyczerpany ` +
        `podczas pobierania danych dla ${symbol}.`
    );
    this.name = "FmpQuotaError";
  }
}

export let fmpRequestCount = 0;

// Gdy raz trafimy na wyczerpany dzienny limit, kolejne zapytania w tym samym
// uruchomieniu i tak dostaną 429 — nie ma sensu odpytywać FMP dla pozostałych
// tickerów (marnuje to ~50s na throttling+timeouty bez żadnej nowej informacji).
let quotaExhausted = false;

function checkForFmpErrorBody(body: unknown, symbolForErrors: string): void {
  if (!body || typeof body !== "object" || Array.isArray(body) || !("Error Message" in body)) return;
  const message = String((body as Record<string, unknown>)["Error Message"]);
  if (/limit/i.test(message)) {
    throw new FmpQuotaError(symbolForErrors);
  }
  throw new Error(`FMP error dla ${symbolForErrors}: ${message}`);
}

async function fmpGet<T>(
  path: string,
  params: Record<string, string | number>,
  symbolForErrors: string
): Promise<T> {
  if (quotaExhausted) {
    throw new FmpQuotaError(symbolForErrors);
  }
  fmpRequestCount++;
  try {
    return await withRetry(
      async () => {
        await throttle();
        try {
          const response = await axios.get(`${BASE_URL}${path}`, {
            params: { ...params, apikey: env.fmpApiKey },
            timeout: 15_000,
          });
          // FMP czasem zwraca 200 OK z body { "Error Message": "Limit Reach ..." }
          // zamiast prawdziwego 429/403, więc trzeba to złapać osobno od statusu HTTP.
          checkForFmpErrorBody(response.data, symbolForErrors);
          return response.data as T;
        } catch (error) {
          // Gdy FMP zwraca realny 429/403 (nie 200), axios rzuca przed dotarciem
          // do kodu wyżej — sprawdzamy body błędu osobno, żeby też złapać limit.
          const body = (error as { response?: { data?: unknown } })?.response?.data;
          checkForFmpErrorBody(body, symbolForErrors);
          throw error;
        }
      },
      { isRetryable: (error) => !(error instanceof FmpQuotaError) && defaultIsRetryable(error) }
    );
  } catch (error) {
    if (error instanceof FmpQuotaError) quotaExhausted = true;
    throw error;
  }
}

function cacheKey(symbol: string, endpoint: string, params: Record<string, string | number>): string {
  const paramsPart = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `fmp:${endpoint}:${symbol}:${paramsPart}`;
}

export interface FmpProfile {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  beta: number;
  price: number;
  marketCap: number;
}

export async function getProfile(symbol: string): Promise<FmpProfile> {
  const { data } = await withCache(
    cacheKey(symbol, "profile", {}),
    CACHE_TTL.ONE_DAY,
    async () => {
      const rows = await fmpGet<FmpProfile[]>("/profile", { symbol }, symbol);
      if (!rows || rows.length === 0) {
        throw new Error(`FMP: brak profilu dla tickera ${symbol}`);
      }
      return rows[0];
    }
  );
  return data;
}

export interface FmpHistoricalBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Dzienna historia cen (OHLC). Domyślnie ~14 miesięcy wstecz — wystarczająco
 * dla 52-tygodniowego maksimum oraz SMA200. Cache'owana raz dziennie: cena
 * historyczna nie zmienia się w ciągu dnia, a to ten sam dzienny limit co
 * dane fundamentalne, więc oszczędzamy zapytania.
 */
export async function getHistoricalPrices(symbol: string): Promise<FmpHistoricalBar[]> {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 420);
  const params = {
    symbol,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };

  const { data } = await withCache(
    cacheKey(symbol, "historical-price-eod-full", params),
    CACHE_TTL.ONE_DAY,
    async () => {
      const rows = await fmpGet<FmpHistoricalBar[]>("/historical-price-eod/full", params, symbol);
      // FMP zwraca od najnowszej do najstarszej; sortujemy rosnąco po dacie.
      return (rows ?? []).slice().reverse();
    }
  );
  return data;
}

export interface FmpIncomeStatement {
  date: string;
  period: string;
  revenue: number;
  netIncome: number;
  operatingIncome: number;
  ebitda: number;
  eps: number;
}

export async function getIncomeStatement(
  symbol: string,
  period: "annual" | "quarter",
  limit: number
): Promise<FmpIncomeStatement[]> {
  const params = { symbol, period, limit };
  const { data } = await withCache(
    cacheKey(symbol, "income-statement", params),
    CACHE_TTL.ONE_DAY,
    () => fmpGet<FmpIncomeStatement[]>("/income-statement", params, symbol)
  );
  return data;
}

export interface FmpBalanceSheet {
  date: string;
  period: string;
  totalAssets: number;
  totalCurrentAssets: number;
  totalCurrentLiabilities: number;
  totalDebt: number;
  cashAndCashEquivalents: number;
}

export async function getBalanceSheet(
  symbol: string,
  period: "annual" | "quarter",
  limit: number
): Promise<FmpBalanceSheet[]> {
  const params = { symbol, period, limit };
  const { data } = await withCache(
    cacheKey(symbol, "balance-sheet-statement", params),
    CACHE_TTL.ONE_DAY,
    () => fmpGet<FmpBalanceSheet[]>("/balance-sheet-statement", params, symbol)
  );
  return data;
}

export interface FmpCashFlowStatement {
  date: string;
  period: string;
  operatingCashFlow: number;
  netIncome: number;
}

export async function getCashFlowStatement(
  symbol: string,
  period: "annual" | "quarter",
  limit: number
): Promise<FmpCashFlowStatement[]> {
  const params = { symbol, period, limit };
  const { data } = await withCache(
    cacheKey(symbol, "cash-flow-statement", params),
    CACHE_TTL.ONE_DAY,
    () => fmpGet<FmpCashFlowStatement[]>("/cash-flow-statement", params, symbol)
  );
  return data;
}

export interface FmpKeyMetrics {
  date: string;
  period: string;
  marketCap: number;
  enterpriseValue: number;
  evToEBITDA: number;
  currentRatio: number;
}

export async function getKeyMetrics(
  symbol: string,
  period: "annual" | "quarter",
  limit: number
): Promise<FmpKeyMetrics[]> {
  const params = { symbol, period, limit };
  const { data } = await withCache(
    cacheKey(symbol, "key-metrics", params),
    CACHE_TTL.ONE_DAY,
    () => fmpGet<FmpKeyMetrics[]>("/key-metrics", params, symbol)
  );
  return data;
}

export interface FmpRatios {
  date: string;
  period: string;
  priceToEarningsRatio: number;
  interestCoverageRatio: number;
  currentRatio: number;
}

/**
 * P/E i interest coverage nie są już częścią /key-metrics w nowym FMP
 * /stable API (przeniesione tutaj), stąd osobny endpoint.
 */
export async function getRatios(
  symbol: string,
  period: "annual" | "quarter",
  limit: number
): Promise<FmpRatios[]> {
  const params = { symbol, period, limit };
  const { data } = await withCache(
    cacheKey(symbol, "ratios", params),
    CACHE_TTL.ONE_DAY,
    () => fmpGet<FmpRatios[]>("/ratios", params, symbol)
  );
  return data;
}
