import type { DrawdownCause } from "../integrations/ai/types";

export type Market = "US" | "PL" | "EU";

/** Wspólny kształt świecy OHLCV używany niezależnie od providera (FMP/EODHD). */
export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DrawdownScoreResult {
  symbol: string;
  market: Market;
  exchange: string; // "US" dla rynku US, kod EODHD (np. "WAR") dla PL/EU
  companyName: string;
  sector: string | null; // null gdy nieznany (PL/EU bez dostępu do fundamentów)
  currentPrice: number;
  high52w: number;
  high90d: number;
  drawdown52w: number; // ułamek, np. -0.35 = -35%
  drawdown90d: number;
  benchmarkSymbol: string | null; // null gdy brak zweryfikowanego benchmarku (PL/EU)
  benchmarkDrawdown52w: number;
  benchmarkDrawdown90d: number;
  beta: number;
  excessDrawdown: number; // ułamek, im bardziej ujemny tym silniejszy "nieuzasadniony" spadek
  rsi14: number;
  priceBelowSma50By2Std: boolean;
  priceBelowSma200By2Std: boolean;
  excessDrawdownScore: number; // znormalizowane 0-100
}

export interface FundamentalCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface FundamentalHealthResult {
  symbol: string;
  available: boolean; // false gdy provider nie udostępnia fundamentów na tym planie (np. EODHD free dla PL/EU)
  checks: FundamentalCheck[];
  fundamentalHealthScore: number | null; // null gdy available === false
  unavailableReason?: string;
}

export interface AiClassificationResult {
  symbol: string;
  cause: DrawdownCause;
  confidence: number; // 0-1
  reasoning: string;
  aiCauseWeight: number; // 0-100, zmapowane z "cause" (patrz aiClassifier.ts)
}

/**
 * Rozbicie composite_score na składowe — każda warstwa może być niedostępna
 * (fundamenty dla PL/EU, AI przy błędzie/limicie), więc zamiast "partial"
 * i "full" jako dwóch osobnych pól, liczymy zawsze `total` na tle `max`
 * (maksimum możliwe do osiągnięcia przy dostępnych warstwach).
 */
export interface CompositeScoreBreakdown {
  drawdownComponent: number; // zawsze dostępne
  fundamentalComponent: number | null;
  aiComponent: number | null;
  total: number;
  max: number; // 100 gdy wszystkie 3 warstwy dostępne, mniej gdy część brakuje
}

export interface CompositeScoreResult {
  symbol: string;
  drawdown: DrawdownScoreResult;
  fundamentals: FundamentalHealthResult;
  aiClassification: AiClassificationResult | null; // null gdy Warstwa 3 zawiodła (np. brak/limit API)
  scoreBreakdown: CompositeScoreBreakdown;
}

export interface SectorRankingResult {
  sector: string;
  rank: number;
  score: number; // 0-100
  reasoning: string;
}
