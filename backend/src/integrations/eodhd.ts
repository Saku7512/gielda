import axios from "axios";
import { env } from "../config/env";
import { CACHE_TTL, withCache } from "./cache";
import { withRetry } from "./httpRetry";
import { createMinIntervalLimiter } from "./rateLimiter";

// EODHD, rynki PL/EU (GPW, XETRA, Euronext) — patrz CLAUDE.md sekcja
// "Rozszerzenie: rynki PL/EU". Plan użytkownika ma bardzo ciasny limit
// (~20 zapytań/dzień), więc każdy endpoint tu MUSI być agresywnie cache'owany —
// zdecydowanie mocniej niż FMP/Finnhub w warstwie US.
const BASE_URL = "https://eodhd.com/api";

// Zweryfikowane empirycznie 2026-09-08:
//   - GET /exchange-symbol-list/{EXCHANGE} działa (np. "WAR" dla GPW)
//   - GET /eod/{SYMBOL}.{EXCHANGE} działa, zwraca OHLCV
//   - GET /fundamentals/{SYMBOL}.{EXCHANGE} zwraca 403 na tym planie:
//     "Only EOD data allowed for free users" — fundamenty PL/EU wymagają
//     płatnego planu. Warstwa 2 scoringu jest więc niedostępna dla PL/EU,
//     dopóki plan się nie zmieni (patrz scoring/fundamentals.ts).
// Indeksy/benchmarki (np. WIG20) NIE są zweryfikowane — nie zgaduj ich
// symbolu, dopisz dopiero po sprawdzeniu.

const throttle = createMinIntervalLimiter(1000);

export let eodhdRequestCount = 0;

export class EodhdPlanLimitError extends Error {
  constructor(symbol: string) {
    super(`EODHD: endpoint niedostępny na obecnym (darmowym) planie dla ${symbol}.`);
    this.name = "EodhdPlanLimitError";
  }
}

async function eodhdGet<T>(path: string, params: Record<string, string | number>, symbolForErrors: string): Promise<T> {
  if (!env.eodhdApiKey) {
    throw new Error("EODHD_API_KEY nie jest ustawiony w backend/.env");
  }
  await throttle();
  eodhdRequestCount++;
  return withRetry(
    async () => {
      try {
        const response = await axios.get<T>(`${BASE_URL}${path}`, {
          params: { ...params, api_token: env.eodhdApiKey, fmt: "json" },
          timeout: 15_000,
        });
        return response.data;
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 403) {
          throw new EodhdPlanLimitError(symbolForErrors);
        }
        throw error;
      }
    },
    { isRetryable: (error) => !(error instanceof EodhdPlanLimitError) }
  );
}

export interface EodhdSymbol {
  Code: string;
  Name: string;
  Country: string;
  Exchange: string;
  Currency: string;
  Type: string;
  Isin: string | null;
}

/**
 * Lista spółek notowanych na danej giełdzie (np. "WAR" dla GPW). Zmienia się
 * rzadko, więc cache trzymamy tydzień — przy limicie ~20 zapytań/dzień nie
 * ma sensu odpytywać częściej.
 */
export async function getExchangeSymbolList(exchangeCode: string): Promise<EodhdSymbol[]> {
  const { data } = await withCache(
    `eodhd:exchange-symbol-list:${exchangeCode}`,
    CACHE_TTL.ONE_DAY * 7,
    () => eodhdGet<EodhdSymbol[]>(`/exchange-symbol-list/${exchangeCode}`, {}, exchangeCode)
  );
  return data;
}

export interface EodhdBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjusted_close: number;
  volume: number;
}

/**
 * Dzienna historia cen (OHLCV) dla tickera EODHD w formacie "SYMBOL.EXCHANGE"
 * (np. "PKN.WAR"). Cache 1 dzień — jak FMP dla rynku US, żeby nie odpytywać
 * częściej niż raz na spółkę dziennie.
 */
export async function getEodPrices(symbolWithExchange: string, fromDate: string): Promise<EodhdBar[]> {
  const { data } = await withCache(
    `eodhd:eod:${symbolWithExchange}:${fromDate}`,
    CACHE_TTL.ONE_DAY,
    () =>
      eodhdGet<EodhdBar[]>(
        `/eod/${symbolWithExchange}`,
        { period: "d", order: "a", from: fromDate },
        symbolWithExchange
      )
  );
  return data;
}
