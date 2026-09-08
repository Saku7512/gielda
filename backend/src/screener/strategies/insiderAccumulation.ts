import { getAiClassifierClient } from "../../integrations/ai";
import {
  buildInsiderAccumulationUserPrompt,
  INSIDER_ACCUMULATION_SYSTEM_PROMPT,
} from "../../integrations/ai/insiderAccumulationPrompt";
import { parseReasoningJson } from "../../integrations/ai/parseReasoning";
import { getInsiderTransactions } from "../../integrations/finnhub";
import { getHistoricalPrices, getProfile } from "../../integrations/fmp";
import { rollingMax } from "../../scoring/indicators";
import type { Market } from "../../scoring/types";
import { STRATEGY_LABELS, type ScreenerCandidate, type Strategy } from "./types";

// Brak precyzyjnej definicji w CLAUDE.md poza "2+ insiderów w oknie spadku
// ceny" — udokumentowane progi.
const LOOKBACK_DAYS = 90;
const MIN_DISTINCT_INSIDERS = 2;
const MIN_DRAWDOWN_FOR_WINDOW = 0.1; // -10% od 90-dniowego maksimum, żeby uznać to za "okno spadku"

const INSIDER_COUNT_WEIGHT = 0.5;
const AI_COMPONENT_WEIGHT = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Strategia C — akumulacja insiderów. Transakcje Form 4 to specyfika SEC/US,
 * więc (jak earningsBeatDrop) działa tylko dla rynku US.
 */
export const insiderAccumulationStrategy: Strategy = {
  id: "insider_accumulation",
  label: STRATEGY_LABELS.insider_accumulation,

  async screen(tickers: string[], market: Market): Promise<ScreenerCandidate[]> {
    if (market !== "US") return [];

    const results: ScreenerCandidate[] = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    for (const ticker of tickers) {
      try {
        const [transactions, bars, profile] = await Promise.all([
          getInsiderTransactions(ticker),
          getHistoricalPrices(ticker),
          getProfile(ticker),
        ]);

        const openMarketBuys = transactions.filter(
          (t) => t.transactionCode === "P" && !t.isDerivative && t.transactionDate >= cutoffStr
        );
        const distinctInsiders = new Set(openMarketBuys.map((t) => t.name));
        if (distinctInsiders.size < MIN_DISTINCT_INSIDERS) continue;

        const currentPrice = bars[bars.length - 1].close;
        const recentHigh = rollingMax(
          bars.slice(-LOOKBACK_DAYS).map((b) => b.high),
          LOOKBACK_DAYS
        );
        const priceChangePct = (currentPrice - recentHigh) / recentHigh;
        if (priceChangePct > -MIN_DRAWDOWN_FOR_WINDOW) continue; // nie jest to "okno spadku"

        let aiReasoning: string | null = null;
        let aiConfidence: number | null = null;
        try {
          const client = getAiClassifierClient();
          const raw = await client.completeJson(
            INSIDER_ACCUMULATION_SYSTEM_PROMPT,
            buildInsiderAccumulationUserPrompt({
              symbol: ticker,
              companyName: profile.companyName,
              currentPrice,
              priceChangePct,
              transactions: openMarketBuys.map((t) => ({
                insiderName: t.name,
                transactionDate: t.transactionDate,
                transactionPrice: t.transactionPrice,
                shares: t.share,
              })),
            })
          );
          const parsed = parseReasoningJson(raw, "insiderAccumulation");
          aiReasoning = parsed.reasoning;
          aiConfidence = parsed.confidence;
        } catch {
          // Warstwa AI zawiodła — kandydat i tak trafia na listę, z niższym scoreMax.
        }

        const insiderCountComponent = clamp((distinctInsiders.size / 5) * 100, 0, 100); // 5+ insiderów => 100
        const aiComponent = aiConfidence !== null ? aiConfidence * 100 : null;
        const score =
          INSIDER_COUNT_WEIGHT * insiderCountComponent + (aiComponent !== null ? AI_COMPONENT_WEIGHT * aiComponent : 0);
        const scoreMax = 100 * (INSIDER_COUNT_WEIGHT + (aiComponent !== null ? AI_COMPONENT_WEIGHT : 0));

        results.push({
          symbol: ticker,
          market,
          exchange: "US",
          companyName: profile.companyName,
          sector: profile.sector,
          currentPrice,
          strategy: "insider_accumulation",
          triggerDetail: `${distinctInsiders.size} insiderów kupujących w ${LOOKBACK_DAYS}d, cena ${(priceChangePct * 100).toFixed(1)}% od maksimum`,
          excessDrawdown: priceChangePct,
          excessDrawdownScore: insiderCountComponent,
          fundamentalAvailable: false,
          fundamentalHealthScore: null,
          aiReasoning,
          aiConfidence,
          score,
          scoreMax,
        });
      } catch (error) {
        console.log(
          `  [insiderAccumulation] ${ticker}: pominięty (${error instanceof Error ? error.message : String(error)})`
        );
      }
    }

    return results;
  },
};
