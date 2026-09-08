import { supabase } from "./supabaseClient";

export interface Candidate {
  symbol: string;
  companyName: string;
  sector: string;
  currentPrice: number;
  excessDrawdown: number; // ułamek, np. -0.35 = -35%
  excessDrawdownScore: number;
  fundamentalHealthScore: number;
  aiCause: string | null;
  aiConfidence: number | null;
  aiReasoning: string | null;
  compositeScore: number | null; // null gdy Warstwa 3 zawiodła dla tego wyniku
  compositeScorePartial: number;
  scoredAt: string;
}

interface ScreenerResultRow {
  symbol: string;
  company_name: string;
  sector: string;
  current_price: number;
  excess_drawdown: number;
  excess_drawdown_score: number;
  fundamental_health_score: number;
  ai_cause: string | null;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  composite_score: number | null;
  composite_score_partial: number;
  scored_at: string;
}

function toCandidate(row: ScreenerResultRow): Candidate {
  return {
    symbol: row.symbol,
    companyName: row.company_name,
    sector: row.sector,
    currentPrice: row.current_price,
    excessDrawdown: row.excess_drawdown,
    excessDrawdownScore: row.excess_drawdown_score,
    fundamentalHealthScore: row.fundamental_health_score,
    aiCause: row.ai_cause,
    aiConfidence: row.ai_confidence,
    aiReasoning: row.ai_reasoning,
    compositeScore: row.composite_score,
    compositeScorePartial: row.composite_score_partial,
    scoredAt: row.scored_at,
  };
}

/**
 * Najnowszy wynik screenera na symbol (widok screener_latest_results,
 * patrz backend/src/db/schema.sql), posortowany po najlepszym wyniku.
 */
export async function getCandidates(): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from("screener_latest_results")
    .select(
      "symbol, company_name, sector, current_price, excess_drawdown, excess_drawdown_score, " +
        "fundamental_health_score, ai_cause, ai_confidence, ai_reasoning, composite_score, " +
        "composite_score_partial, scored_at"
    )
    .order("composite_score", { ascending: false, nullsFirst: false })
    .order("composite_score_partial", { ascending: false })
    .returns<ScreenerResultRow[]>();

  if (error) {
    throw new Error(`Supabase: błąd pobierania kandydatów: ${error.message}`);
  }
  return data.map(toCandidate);
}
