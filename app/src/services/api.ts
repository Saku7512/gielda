import { supabase } from "./supabaseClient";

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Brak konfiguracji Supabase (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY). " +
        "Ustaw je w app/.env (lokalnie) lub jako EAS environment variables (w buildzie EAS)."
    );
    this.name = "SupabaseNotConfiguredError";
  }
}

export type Market = "US" | "PL" | "EU";

export interface Candidate {
  symbol: string;
  market: Market;
  exchange: string;
  companyName: string;
  sector: string | null; // null gdy nieznany (PL/EU bez fundamentów)
  currentPrice: number;
  excessDrawdown: number; // ułamek, np. -0.35 = -35%
  excessDrawdownScore: number;
  fundamentalAvailable: boolean;
  fundamentalHealthScore: number | null;
  aiCause: string | null;
  aiConfidence: number | null;
  aiReasoning: string | null;
  compositeScore: number;
  compositeScoreMax: number; // 100 gdy wszystkie warstwy dostępne, mniej gdy część brakuje
  scoredAt: string;
}

interface ScreenerResultRow {
  symbol: string;
  market: Market;
  exchange: string;
  company_name: string;
  sector: string | null;
  current_price: number;
  excess_drawdown: number;
  excess_drawdown_score: number;
  fundamental_available: boolean;
  fundamental_health_score: number | null;
  ai_cause: string | null;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  composite_score: number;
  composite_score_max: number;
  scored_at: string;
}

function toCandidate(row: ScreenerResultRow): Candidate {
  return {
    symbol: row.symbol,
    market: row.market,
    exchange: row.exchange,
    companyName: row.company_name,
    sector: row.sector,
    currentPrice: row.current_price,
    excessDrawdown: row.excess_drawdown,
    excessDrawdownScore: row.excess_drawdown_score,
    fundamentalAvailable: row.fundamental_available,
    fundamentalHealthScore: row.fundamental_health_score,
    aiCause: row.ai_cause,
    aiConfidence: row.ai_confidence,
    aiReasoning: row.ai_reasoning,
    compositeScore: row.composite_score,
    compositeScoreMax: row.composite_score_max,
    scoredAt: row.scored_at,
  };
}

const CANDIDATE_COLUMNS =
  "symbol, market, exchange, company_name, sector, current_price, excess_drawdown, excess_drawdown_score, " +
  "fundamental_available, fundamental_health_score, ai_cause, ai_confidence, ai_reasoning, composite_score, " +
  "composite_score_max, scored_at";

/**
 * Najnowszy wynik screenera na symbol (widok screener_latest_results,
 * patrz backend/src/db/schema.sql), posortowany po najlepszym wyniku.
 */
export async function getCandidates(): Promise<Candidate[]> {
  if (!supabase) {
    throw new SupabaseNotConfiguredError();
  }

  const { data, error } = await supabase
    .from("screener_latest_results")
    .select(CANDIDATE_COLUMNS)
    .order("composite_score", { ascending: false })
    .returns<ScreenerResultRow[]>();

  if (error) {
    throw new Error(`Supabase: błąd pobierania kandydatów: ${error.message}`);
  }
  return data.map(toCandidate);
}

export interface SectorRanking {
  sector: string;
  rank: number;
  score: number;
  reasoning: string;
  computedAt: string;
}

interface SectorRankingRow {
  sector: string;
  rank: number;
  score: number;
  reasoning: string;
  computed_at: string;
}

/** Najnowszy ranking branż (widok sector_rankings_latest — Warstwa 0). */
export async function getSectorRankings(): Promise<SectorRanking[]> {
  if (!supabase) {
    throw new SupabaseNotConfiguredError();
  }

  const { data, error } = await supabase
    .from("sector_rankings_latest")
    .select("sector, rank, score, reasoning, computed_at")
    .order("rank", { ascending: true })
    .returns<SectorRankingRow[]>();

  if (error) {
    throw new Error(`Supabase: błąd pobierania rankingu branż: ${error.message}`);
  }
  return data.map((row) => ({
    sector: row.sector,
    rank: row.rank,
    score: row.score,
    reasoning: row.reasoning,
    computedAt: row.computed_at,
  }));
}
