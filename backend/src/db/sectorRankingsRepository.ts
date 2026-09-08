import { env } from "../config/env";
import type { SectorRankingResult } from "../scoring/types";
import { getSupabaseClient } from "./supabaseClient";

function toRow(item: SectorRankingResult) {
  return {
    sector: item.sector,
    rank: item.rank,
    score: item.score,
    reasoning: item.reasoning,
    ai_provider: env.aiProvider,
  };
}

/** Insert-only, jak screenerResultsRepository — patrz schema.sql (tabela sector_rankings). */
export async function saveSectorRankings(rankings: SectorRankingResult[]): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  if (rankings.length === 0) return true;

  const { error } = await supabase.from("sector_rankings").insert(rankings.map(toRow));
  if (error) {
    throw new Error(`Supabase: błąd zapisu rankingu branż: ${error.message}`);
  }
  return true;
}
