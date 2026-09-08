import type { Market } from "../../scoring/types";

export type StrategyId = "overreacted_drawdown" | "earnings_beat_drop" | "insider_accumulation";

export const STRATEGY_LABELS: Record<StrategyId, string> = {
  overreacted_drawdown: "Przesadzona reakcja",
  earnings_beat_drop: "Dobre wyniki, zły odbiór",
  insider_accumulation: "Akumulacja insiderów",
};

/**
 * Kandydat wyprodukowany przez dowolną strategię — wspólny kształt do
 * zapisu/UI, niezależnie od tego, jak dana strategia go wykryła i oceniła.
 * Pola drawdown/fundamentals są nullable, bo nie każda strategia je liczy
 * (np. insiderAccumulation nie liczy excess_drawdown vs benchmark).
 */
export interface ScreenerCandidate {
  symbol: string;
  market: Market;
  exchange: string;
  companyName: string;
  sector: string | null;
  currentPrice: number;
  strategy: StrategyId;
  triggerDetail: string; // krótki, czytelny opis co spowodowało trigger (do UI/debug)
  excessDrawdown: number | null;
  excessDrawdownScore: number | null;
  fundamentalAvailable: boolean;
  fundamentalHealthScore: number | null;
  aiReasoning: string | null;
  aiConfidence: number | null;
  score: number; // 0-100, znaczenie zależne od strategii (patrz komentarz w każdej strategii)
  scoreMax: number; // <=100 gdy część warstw niedostępna dla danego kandydata
}

/**
 * Wspólny interfejs strategii: dostaje listę tickerów z watchlisty danego
 * rynku, sama decyduje o triggerze i sama liczy resztę (scoring, AI) —
 * różne strategie mają zbyt różną wewnętrzną logikę, żeby narzucać sztywny
 * dwuetapowy trigger/scoring pipeline.
 */
export interface Strategy {
  id: StrategyId;
  label: string;
  screen(tickers: string[], market: Market): Promise<ScreenerCandidate[]>;
}
