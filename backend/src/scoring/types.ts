import type { DrawdownCause } from "../integrations/ai/types";

export interface DrawdownScoreResult {
  symbol: string;
  companyName: string;
  sector: string;
  currentPrice: number;
  high52w: number;
  high90d: number;
  drawdown52w: number; // ułamek, np. -0.35 = -35%
  drawdown90d: number;
  benchmarkSymbol: string;
  benchmarkDrawdown52w: number;
  benchmarkDrawdown90d: number;
  beta: number;
  excessDrawdown: number; // ułamek, im bardziej ujemny tym silniejszy "nieuzasadniony" spadek
  rsi14: number;
  priceBelowSma50By2Std: boolean;
  priceBelowSma200By2Std: boolean;
  excessDrawdownScore: number; // znormalizowane 0-100
}

export interface FundamentalCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface FundamentalHealthResult {
  symbol: string;
  checks: FundamentalCheck[];
  fundamentalHealthScore: number; // 0-100, udział spełnionych checków
}

export interface AiClassificationResult {
  symbol: string;
  cause: DrawdownCause;
  confidence: number; // 0-1
  reasoning: string;
  aiCauseWeight: number; // 0-100, zmapowane z "cause" (patrz aiClassifier.ts)
}

export interface CompositeScoreResult {
  symbol: string;
  drawdown: DrawdownScoreResult;
  fundamentals: FundamentalHealthResult;
  aiClassification: AiClassificationResult | null; // null gdy Warstwa 3 zawiodła (np. brak/limit API)
  compositeScorePartial: number; // 0-75, tylko Warstwy 1+2 (patrz compositeScore.ts)
  compositeScore: number | null; // 0-100, pełny wzór z CLAUDE.md; null gdy aiClassification === null
}
