import { getAiClassifierClient } from "../integrations/ai";
import { parseSectorRankingJson } from "../integrations/ai/parseSectorRanking";
import { buildSectorRankingUserPrompt, SECTOR_RANKING_SYSTEM_PROMPT } from "../integrations/ai/sectorRankingPrompt";
import type { SectorAggregateInput } from "../integrations/ai/sectorRankingPrompt";
import type { ScreenerCandidate } from "../screener/strategies/types";
import type { SectorRankingResult } from "./types";

const MAX_TOP_SYMBOLS = 5;

/**
 * Agreguje kandydatów bieżącego cyklu per sektor. Tylko Strategia A
 * (overreacted_drawdown) liczy pełny excess_drawdown/fundamenty w sensie
 * porównywalnym między spółkami — kandydaci z Strategii B/C mają inną
 * semantykę `score`, więc są pomijani w tej agregacji. Spółki bez sektora
 * (PL/EU bez dostępu do fundamentów) też są pomijane — nie da się ich
 * sensownie przypisać do branży bez zgadywania.
 */
export function aggregateBySector(candidates: ScreenerCandidate[]): SectorAggregateInput[] {
  const relevant = candidates.filter((c) => c.strategy === "overreacted_drawdown" && c.sector);
  const bySector = new Map<string, ScreenerCandidate[]>();
  for (const candidate of relevant) {
    const sector = candidate.sector as string;
    const list = bySector.get(sector) ?? [];
    list.push(candidate);
    bySector.set(sector, list);
  }

  return Array.from(bySector.entries()).map(([sector, items]) => {
    const avgExcessDrawdownScore =
      items.reduce((sum, c) => sum + (c.excessDrawdownScore ?? 0), 0) / items.length;

    const withFundamentals = items.filter((c) => c.fundamentalAvailable && c.fundamentalHealthScore !== null);
    const avgFundamentalHealthScore =
      withFundamentals.length > 0
        ? withFundamentals.reduce((sum, c) => sum + (c.fundamentalHealthScore ?? 0), 0) / withFundamentals.length
        : null;

    return {
      sector,
      companyCount: items.length,
      avgExcessDrawdownScore,
      avgFundamentalHealthScore,
      topSymbols: items
        .slice()
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_TOP_SYMBOLS)
        .map((c) => c.symbol),
    };
  });
}

/**
 * Warstwa 0 — ranking branż. UWAGA: bez dostępu do newsów makro/geopolitycznych
 * (RSS z CLAUDE.md nie jest jeszcze zaimplementowane) — model AI ranguje
 * wyłącznie na podstawie zagregowanych wyników bieżącego cyklu screenera.
 */
export async function rankSectors(candidates: ScreenerCandidate[]): Promise<SectorRankingResult[]> {
  const aggregates = aggregateBySector(candidates);
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
