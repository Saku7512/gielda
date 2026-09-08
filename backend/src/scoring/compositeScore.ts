import type { CompositeScoreBreakdown, DrawdownScoreResult, FundamentalHealthResult } from "./types";

// Wagi z CLAUDE.md:
//   score = 0.35 * excess_drawdown_normalized
//         + 0.40 * fundamental_health_normalized
//         + 0.25 * ai_cause_weight
export const DRAWDOWN_WEIGHT = 0.35;
export const FUNDAMENTAL_WEIGHT = 0.4;
export const AI_WEIGHT = 0.25;

/**
 * Każda warstwa poza drawdown może być niedostępna (fundamenty dla PL/EU na
 * darmowym planie EODHD, AI przy błędzie/limicie API) — zamiast fabrykować
 * wartość zastępczą, liczymy sumę tylko z dostępnych składowych i zwracamy
 * `max`, żeby UI mogło pokazać "62/75" zamiast mylącego "62/100".
 */
export function computeCompositeScore(
  drawdown: DrawdownScoreResult,
  fundamentals: FundamentalHealthResult,
  aiCauseWeight: number | null
): CompositeScoreBreakdown {
  const drawdownComponent = DRAWDOWN_WEIGHT * drawdown.excessDrawdownScore;
  const fundamentalComponent =
    fundamentals.available && fundamentals.fundamentalHealthScore !== null
      ? FUNDAMENTAL_WEIGHT * fundamentals.fundamentalHealthScore
      : null;
  const aiComponent = aiCauseWeight !== null ? AI_WEIGHT * aiCauseWeight : null;

  const total = drawdownComponent + (fundamentalComponent ?? 0) + (aiComponent ?? 0);
  const max =
    100 *
    (DRAWDOWN_WEIGHT +
      (fundamentalComponent !== null ? FUNDAMENTAL_WEIGHT : 0) +
      (aiComponent !== null ? AI_WEIGHT : 0));

  return { drawdownComponent, fundamentalComponent, aiComponent, total, max };
}
