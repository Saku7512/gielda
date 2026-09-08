import { getAiClassifierClient } from "../integrations/ai";
import { parseSectorRankingJson } from "../integrations/ai/parseSectorRanking";
import { buildSectorRankingUserPrompt, SECTOR_RANKING_SYSTEM_PROMPT } from "../integrations/ai/sectorRankingPrompt";
import type { SectorAggregateInput } from "../integrations/ai/sectorRankingPrompt";
import type { CompositeScoreResult, SectorRankingResult } from "./types";

const MAX_TOP_SYMBOLS = 5;

/**
 * Agreguje wyniki bieżącego cyklu screenera per sektor. Spółki bez sektora
 * (PL/EU bez dostępu do fundamentów — patrz drawdown.ts) są pomijane: nie da
 * się ich sensownie przypisać do branży bez zgadywania.
 */
export function aggregateBySector(results: CompositeScoreResult[]): SectorAggregateInput[] {
  const bySector = new Map<string, CompositeScoreResult[]>();
  for (const result of results) {
    const sector = result.drawdown.sector;
    if (!sector) continue;
    const list = bySector.get(sector) ?? [];
    list.push(result);
    bySector.set(sector, list);
  }

  return Array.from(bySector.entries()).map(([sector, items]) => {
    const avgExcessDrawdownScore =
      items.reduce((sum, r) => sum + r.drawdown.excessDrawdownScore, 0) / items.length;

    const withFundamentals = items.filter(
      (r) => r.fundamentals.available && r.fundamentals.fundamentalHealthScore !== null
    );
    const avgFundamentalHealthScore =
      withFundamentals.length > 0
        ? withFundamentals.reduce((sum, r) => sum + (r.fundamentals.fundamentalHealthScore ?? 0), 0) /
          withFundamentals.length
        : null;

    return {
      sector,
      companyCount: items.length,
      avgExcessDrawdownScore,
      avgFundamentalHealthScore,
      topSymbols: items
        .slice()
        .sort((a, b) => b.scoreBreakdown.total - a.scoreBreakdown.total)
        .slice(0, MAX_TOP_SYMBOLS)
        .map((r) => r.symbol),
    };
  });
}

/**
 * Warstwa 0 — ranking branż. UWAGA: bez dostępu do newsów makro/geopolitycznych
 * (RSS z CLAUDE.md nie jest jeszcze zaimplementowane) — model AI ranguje
 * wyłącznie na podstawie zagregowanych wyników bieżącego cyklu screenera.
 */
export async function rankSectors(results: CompositeScoreResult[]): Promise<SectorRankingResult[]> {
  const aggregates = aggregateBySector(results);
  if (aggregates.length === 0) {
    return [];
  }

  const client = getAiClassifierClient();
  const raw = await client.completeJson(
    SECTOR_RANKING_SYSTEM_PROMPT,
    buildSectorRankingUserPrompt(aggregates)
  );
  return parseSectorRankingJson(raw, "sectorRanking");
}
