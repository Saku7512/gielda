import { classifyDrawdownCause } from "../../scoring/aiClassifier";
import { computeCompositeScore } from "../../scoring/compositeScore";
import { computeDrawdownScore, computeDrawdownScoreEodhd } from "../../scoring/drawdown";
import { computeFundamentalHealthScore, unavailableFundamentalHealth } from "../../scoring/fundamentals";
import type { DrawdownScoreResult, FundamentalHealthResult, Market } from "../../scoring/types";
import { STRATEGY_LABELS, type ScreenerCandidate, type Strategy } from "./types";

const CAUSE_LABELS: Record<string, string> = {
  market_overreaction: "Przesadzona reakcja rynku",
  fundamental_deterioration: "Pogorszenie fundamentów",
  structural_geopolitical_risk: "Ryzyko strukturalne/geopolityczne",
};

async function computeDrawdownAndFundamentals(
  ticker: string,
  market: Market
): Promise<{ drawdown: DrawdownScoreResult; fundamentals: FundamentalHealthResult }> {
  if (market === "US") {
    const [drawdown, fundamentals] = await Promise.all([
      computeDrawdownScore(ticker),
      computeFundamentalHealthScore(ticker),
    ]);
    return { drawdown, fundamentals };
  }

  const drawdown = await computeDrawdownScoreEodhd(ticker, market);
  const fundamentals = unavailableFundamentalHealth(
    ticker,
    "EODHD: fundamenty niedostępne na darmowym planie dla rynków PL/EU (403 - tylko EOD)"
  );
  return { drawdown, fundamentals };
}

/**
 * Strategia A — dotychczasowa (jedyna) logika screenera, wydzielona pod
 * wspólny interfejs Strategy. Trigger to obecność w watchliście (bez
 * dodatkowego progu wejściowego) — próg ">70" z CLAUDE.md jest tylko
 * informacyjny przy interpretacji wyniku, nie filtruje candidates.
 */
export const overreactedDrawdownStrategy: Strategy = {
  id: "overreacted_drawdown",
  label: STRATEGY_LABELS.overreacted_drawdown,

  async screen(tickers: string[], market: Market): Promise<ScreenerCandidate[]> {
    const results: ScreenerCandidate[] = [];

    for (const ticker of tickers) {
      const { drawdown, fundamentals } = await computeDrawdownAndFundamentals(ticker, market);

      let aiCause: string | null = null;
      let aiReasoning: string | null = null;
      let aiConfidence: number | null = null;
      let aiCauseWeight: number | null = null;
      try {
        const classification = await classifyDrawdownCause({
          symbol: ticker,
          companyName: drawdown.companyName,
          sector: drawdown.sector,
          market,
          priceDrawdownPct: drawdown.excessDrawdown,
        });
        aiCause = classification.cause;
        aiReasoning = classification.reasoning;
        aiConfidence = classification.confidence;
        aiCauseWeight = classification.aiCauseWeight;
      } catch {
        // Warstwa 3 zawiodła (błąd/limit API) — kontynuujemy z compositeScore
        // bez tej warstwy, patrz compositeScore.ts.
      }

      const breakdown = computeCompositeScore(drawdown, fundamentals, aiCauseWeight);

      results.push({
        symbol: ticker,
        market,
        exchange: drawdown.exchange,
        companyName: drawdown.companyName,
        sector: drawdown.sector,
        currentPrice: drawdown.currentPrice,
        strategy: "overreacted_drawdown",
        triggerDetail: `excess_drawdown ${(drawdown.excessDrawdown * 100).toFixed(1)}%`,
        excessDrawdown: drawdown.excessDrawdown,
        excessDrawdownScore: drawdown.excessDrawdownScore,
        fundamentalAvailable: fundamentals.available,
        fundamentalHealthScore: fundamentals.fundamentalHealthScore,
        aiReasoning: aiReasoning ? `${aiCause ? CAUSE_LABELS[aiCause] ?? aiCause : ""}: ${aiReasoning}`.trim() : null,
        aiConfidence,
        score: breakdown.total,
        scoreMax: breakdown.max,
      });
    }

    return results;
  },
};
