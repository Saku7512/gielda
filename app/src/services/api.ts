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
export type Strategy = "overreacted_drawdown" | "earnings_beat_drop" | "insider_accumulation";

export const STRATEGY_LABELS: Record<Strategy, string> = {
  overreacted_drawdown: "Przesadzona reakcja",
  earnings_beat_drop: "Dobre wyniki, zły odbiór",
  insider_accumulation: "Akumulacja insiderów",
};

export interface Candidate {
  symbol: string;
  market: Market;
  exchange: string;
  strategy: Strategy;
  triggerDetail: string;
  companyName: string;
  sector: string | null; // null gdy nieznany (PL/EU bez fundamentów)
  currentPrice: number;
  excessDrawdown: number | null; // znaczenie zależne od strategii, patrz backend/screener/strategies
  excessDrawdownScore: number | null;
  fundamentalAvailable: boolean;
  fundamentalHealthScore: number | null;
  aiReasoning: string | null;
  aiConfidence: number | null;
  compositeScore: number;
  compositeScoreMax: number; // 100 gdy wszystkie warstwy dostępne, mniej gdy część brakuje
  scoredAt: string;
}

interface ScreenerResultRow {
  symbol: string;
  market: Market;
  exchange: string;
  strategy: Strategy;
  trigger_detail: string;
  company_name: string;
  sector: string | null;
  current_price: number;
  excess_drawdown: number | null;
  excess_drawdown_score: number | null;
  fundamental_available: boolean;
  fundamental_health_score: number | null;
  ai_reasoning: string | null;
  ai_confidence: number | null;
  composite_score: number;
  composite_score_max: number;
  scored_at: string;
}

function toCandidate(row: ScreenerResultRow): Candidate {
  return {
    symbol: row.symbol,
    market: row.market,
    exchange: row.exchange,
    strategy: row.strategy,
    triggerDetail: row.trigger_detail,
    companyName: row.company_name,
    sector: row.sector,
    currentPrice: row.current_price,
    excessDrawdown: row.excess_drawdown,
    excessDrawdownScore: row.excess_drawdown_score,
    fundamentalAvailable: row.fundamental_available,
    fundamentalHealthScore: row.fundamental_health_score,
    aiReasoning: row.ai_reasoning,
    aiConfidence: row.ai_confidence,
    compositeScore: row.composite_score,
    compositeScoreMax: row.composite_score_max,
    scoredAt: row.scored_at,
  };
}

const CANDIDATE_COLUMNS =
  "symbol, market, exchange, strategy, trigger_detail, company_name, sector, current_price, " +
  "excess_drawdown, excess_drawdown_score, fundamental_available, fundamental_health_score, " +
  "ai_reasoning, ai_confidence, composite_score, composite_score_max, scored_at";

/**
 * Najnowszy wynik screenera na (symbol, strategy) (widok screener_latest_results,
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
