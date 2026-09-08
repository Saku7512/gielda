import { getAiClassifierClient } from "../../integrations/ai";
import {
  buildEarningsBeatDropUserPrompt,
  EARNINGS_BEAT_DROP_SYSTEM_PROMPT,
} from "../../integrations/ai/earningsBeatDropPrompt";
import { parseReasoningJson } from "../../integrations/ai/parseReasoning";
import { getEarnings, getHistoricalPrices, getProfile } from "../../integrations/fmp";
import type { Market } from "../../scoring/types";
import { STRATEGY_LABELS, type ScreenerCandidate, type Strategy } from "./types";

// Konfigurowalne progi triggera — brak precyzyjnej definicji w CLAUDE.md poza
// "spadek ceny > X% w oknie 3-5 dni", więc przyjmujemy udokumentowane wartości.
const MIN_DROP_AFTER_BEAT = 0.05; // -5%: próg wejścia triggera
const MAX_EXPECTED_DROP = 0.25; // -25% => score 100 (górna granica normalizacji)
const WINDOW_START_DAYS = 3;
const WINDOW_END_DAYS = 5;

const PRICE_COMPONENT_WEIGHT = 0.6;
const AI_COMPONENT_WEIGHT = 0.4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Strategia B — earnings beat, ale cena spadła. Działa tylko dla rynku US:
 * FMP /earnings (per-symbol EPS actual/estimate) jest zweryfikowane, EODHD
 * nie ma zweryfikowanego odpowiednika dla PL/EU — nie zgadujemy.
 */
export const earningsBeatDropStrategy: Strategy = {
  id: "earnings_beat_drop",
  label: STRATEGY_LABELS.earnings_beat_drop,

  async screen(tickers: string[], market: Market): Promise<ScreenerCandidate[]> {
    if (market !== "US") return [];

    const results: ScreenerCandidate[] = [];

    for (const ticker of tickers) {
      try {
        const [earnings, bars, profile] = await Promise.all([
          getEarnings(ticker, 5), // limit FMP dla /earnings na tym planie to max 5 (zweryfikowane empirycznie)
          getHistoricalPrices(ticker),
          getProfile(ticker),
        ]);

        // Najnowszy raport z rzeczywistym EPS (nie przyszła estymacja) i beatem.
        const beat = earnings.find((e) => e.epsActual !== null && e.epsActual > (e.epsEstimated ?? -Infinity));
        if (!beat || !beat.epsActual) continue;

        const earningsIdx = bars.findIndex((b) => b.date >= beat.date);
        if (earningsIdx === -1 || earningsIdx + WINDOW_END_DAYS >= bars.length) continue;

        const baselinePrice = bars[earningsIdx].close;
        const windowBars = bars.slice(earningsIdx + WINDOW_START_DAYS, earningsIdx + WINDOW_END_DAYS + 1);
        const worstPrice = Math.min(...windowBars.map((b) => b.close));
        const priceChangePct = (worstPrice - baselinePrice) / baselinePrice;

        if (priceChangePct > -MIN_DROP_AFTER_BEAT) continue; // brak triggera

        let aiReasoning: string | null = null;
        let aiConfidence: number | null = null;
        try {
          const client = getAiClassifierClient();
          const raw = await client.completeJson(
            EARNINGS_BEAT_DROP_SYSTEM_PROMPT,
            buildEarningsBeatDropUserPrompt({
              symbol: ticker,
              companyName: profile.companyName,
              earningsDate: beat.date,
              epsActual: beat.epsActual,
              epsEstimated: beat.epsEstimated ?? beat.epsActual,
              priceChangePct,
            })
          );
          const parsed = parseReasoningJson(raw, "earningsBeatDrop");
          aiReasoning = parsed.reasoning;
          aiConfidence = parsed.confidence;
        } catch {
          // Warstwa AI zawiodła — kandydat i tak trafia na listę, z niższym scoreMax.
        }

        const priceComponent = clamp((-priceChangePct / MAX_EXPECTED_DROP) * 100, 0, 100);
        const aiComponent = aiConfidence !== null ? aiConfidence * 100 : null;
        const score =
          PRICE_COMPONENT_WEIGHT * priceComponent + (aiComponent !== null ? AI_COMPONENT_WEIGHT * aiComponent : 0);
        const scoreMax = 100 * (PRICE_COMPONENT_WEIGHT + (aiComponent !== null ? AI_COMPONENT_WEIGHT : 0));

        results.push({
          symbol: ticker,
          market,
          exchange: "US",
          companyName: profile.companyName,
          sector: profile.sector,
          currentPrice: bars[bars.length - 1].close,
          strategy: "earnings_beat_drop",
          triggerDetail: `EPS ${beat.epsActual} vs est. ${beat.epsEstimated} (${beat.date}), cena ${(priceChangePct * 100).toFixed(1)}% w oknie ${WINDOW_START_DAYS}-${WINDOW_END_DAYS}d`,
          excessDrawdown: priceChangePct,
          excessDrawdownScore: priceComponent,
          fundamentalAvailable: false,
          fundamentalHealthScore: null,
          aiReasoning,
          aiConfidence,
          score,
          scoreMax,
        });
      } catch (error) {
        console.log(
          `  [earningsBeatDrop] ${ticker}: pominięty (${error instanceof Error ? error.message : String(error)})`
        );
      }
    }

    return results;
  },
};
