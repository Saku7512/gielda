/**
 * Mapowanie sektora (pole "sector" z FMP /profile) na sektorowy ETF SPDR,
 * używany jako benchmark do wyliczenia excess_drawdown. Gdy sektor nie jest
 * rozpoznany, funkcja zwraca SPY (szeroki rynek) jako fallback.
 */
const SECTOR_TO_ETF: Record<string, string> = {
  Technology: "XLK",
  "Financial Services": "XLF",
  Energy: "XLE",
  Healthcare: "XLV",
  "Consumer Cyclical": "XLY",
  "Consumer Defensive": "XLP",
  Industrials: "XLI",
  "Basic Materials": "XLB",
  Utilities: "XLU",
  "Real Estate": "XLRE",
  "Communication Services": "XLC",
};

export const MARKET_BENCHMARK_SYMBOL = "SPY";

export function sectorToEtf(sector: string | undefined | null): string {
  if (!sector) return MARKET_BENCHMARK_SYMBOL;
  return SECTOR_TO_ETF[sector] ?? MARKET_BENCHMARK_SYMBOL;
}
