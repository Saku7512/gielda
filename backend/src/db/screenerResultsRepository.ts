import type { ScreenerCandidate } from "../screener/strategies/types";
import { getSupabaseClient } from "./supabaseClient";

function toRow(candidate: ScreenerCandidate) {
  return {
    symbol: candidate.symbol,
    market: candidate.market,
    exchange: candidate.exchange,
    strategy: candidate.strategy,
    trigger_detail: candidate.triggerDetail,
    company_name: candidate.companyName,
    sector: candidate.sector,
    current_price: candidate.currentPrice,
    excess_drawdown: candidate.excessDrawdown,
    excess_drawdown_score: candidate.excessDrawdownScore,
    fundamental_available: candidate.fundamentalAvailable,
    fundamental_health_score: candidate.fundamentalHealthScore,
    ai_reasoning: candidate.aiReasoning,
    ai_confidence: candidate.aiConfidence,
    composite_score: candidate.score,
    composite_score_max: candidate.scoreMax,
  };
}

/**
 * Zapisuje wyniki screenera do Supabase (insert-only, patrz schema.sql).
 * Zwraca `false` bez rzucania błędu, gdy Supabase nie jest skonfigurowane —
 * runScreener ma wtedy działać dalej (tabela w konsoli to nadal działa).
 */
export async function saveScreenerResults(candidates: ScreenerCandidate[]): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  if (candidates.length === 0) return true;

  const { error } = await supabase.from("screener_results").insert(candidates.map(toRow));
  if (error) {
    throw new Error(`Supabase: błąd zapisu wyników screenera: ${error.message}`);
  }
  return true;
}
