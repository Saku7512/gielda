import type { DrawdownScoreResult, FundamentalHealthResult } from "./types";

// Wagi z CLAUDE.md:
//   score = 0.35 * excess_drawdown_normalized
//         + 0.40 * fundamental_health_normalized
//         + 0.25 * ai_cause_weight
export const DRAWDOWN_WEIGHT = 0.35;
export const FUNDAMENTAL_WEIGHT = 0.4;
export const AI_WEIGHT = 0.25;

/** Suma tylko Warstw 1+2 (0-75) — używana jako fallback, gdy Warstwa 3 zawiedzie dla danego tickera. */
export function computeCompositeScorePartial(
  drawdown: DrawdownScoreResult,
  fundamentals: FundamentalHealthResult
): number {
  return (
    DRAWDOWN_WEIGHT * drawdown.excessDrawdownScore + FUNDAMENTAL_WEIGHT * fundamentals.fundamentalHealthScore
  );
}

/** Pełny wzór z CLAUDE.md (0-100). Próg kandydata na liście: score > 70. */
export function computeCompositeScore(
  drawdown: DrawdownScoreResult,
  fundamentals: FundamentalHealthResult,
  aiCauseWeight: number
): number {
  return computeCompositeScorePartial(drawdown, fundamentals) + AI_WEIGHT * aiCauseWeight;
}
