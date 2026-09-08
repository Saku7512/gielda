import { env } from "../config/env";
import type { CompositeScoreResult } from "../scoring/types";
import { getSupabaseClient } from "./supabaseClient";

function toRow(result: CompositeScoreResult) {
  const { drawdown, fundamentals, aiClassification, scoreBreakdown } = result;
  return {
    symbol: result.symbol,
    market: drawdown.market,
    exchange: drawdown.exchange,
    company_name: drawdown.companyName,
    sector: drawdown.sector,
    current_price: drawdown.currentPrice,
    benchmark_symbol: drawdown.benchmarkSymbol,
    beta: drawdown.beta,
    excess_drawdown: drawdown.excessDrawdown,
    excess_drawdown_score: drawdown.excessDrawdownScore,
    rsi14: drawdown.rsi14,
    fundamental_available: fundamentals.available,
    fundamental_health_score: fundamentals.fundamentalHealthScore,
    fundamental_checks: fundamentals.checks,
    ai_provider: aiClassification ? env.aiProvider : null,
    ai_cause: aiClassification?.cause ?? null,
    ai_confidence: aiClassification?.confidence ?? null,
    ai_reasoning: aiClassification?.reasoning ?? null,
    composite_score: scoreBreakdown.total,
    composite_score_max: scoreBreakdown.max,
  };
}

/**
 * Zapisuje wyniki screenera do Supabase (insert-only, patrz schema.sql).
 * Zwraca `false` bez rzucania błędu, gdy Supabase nie jest skonfigurowane —
 * runScreener ma wtedy działać dalej (tabela w konsoli to nadal działa).
 */
export async function saveScreenerResults(results: CompositeScoreResult[]): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  if (results.length === 0) return true;

  const { error } = await supabase.from("screener_results").insert(results.map(toRow));
  if (error) {
    throw new Error(`Supabase: błąd zapisu wyników screenera: ${error.message}`);
  }
  return true;
}
