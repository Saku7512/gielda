import { getHistoricalPrices, getProfile, type FmpHistoricalBar } from "../integrations/fmp";
import { rollingMax, rsi, sma, stddev } from "./indicators";
import { MARKET_BENCHMARK_SYMBOL, sectorToEtf } from "./sectorMap";
import type { DrawdownScoreResult } from "./types";

const DAYS_52W = 365;
const DAYS_90D = 90;

// Heurystyki normalizacji — brak precyzyjnej definicji w CLAUDE.md, więc
// przyjmujemy proste, udokumentowane progi (do skalibrowania po zebraniu
// realnych danych z watchlisty).
const MAX_EXPECTED_EXCESS_DRAWDOWN = 0.5; // -50% excess drawdown => score 100
const RSI_OVERSOLD_BONUS = 10;
const SMA_DEVIATION_BONUS = 5;
const RSI_OVERSOLD_THRESHOLD = 30;
const STD_DEV_MULTIPLIER = 2;

function barsWithinDays(bars: FmpHistoricalBar[], days: number): FmpHistoricalBar[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filtered = bars.filter((bar) => bar.date >= cutoffStr);
  return filtered.length > 0 ? filtered : bars;
}

function drawdownFromHigh(bars: FmpHistoricalBar[], days: number): { high: number; drawdown: number } {
  const window = barsWithinDays(bars, days);
  const currentPrice = bars[bars.length - 1].close;
  const high = rollingMax(
    window.map((b) => b.high),
    window.length
  );
  return { high, drawdown: (currentPrice - high) / high };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function computeDrawdownScore(symbol: string): Promise<DrawdownScoreResult> {
  const [profile, stockBars] = await Promise.all([getProfile(symbol), getHistoricalPrices(symbol)]);

  if (stockBars.length < 20) {
    throw new Error(`Za mało danych historycznych dla ${symbol} (${stockBars.length} świec) — pomijam.`);
  }

  // Sektorowe ETF-y SPDR (XLK, XLF, ...) są na darmowym planie FMP zablokowane
  // (402 "Premium Query Parameter") — tylko SPY jest dostępny za darmo. Próbujemy
  // sektorowego ETF-a (gdyby plan kiedyś się zmienił), a przy błędzie spadamy
  // na SPY jako benchmark rynkowy.
  let benchmarkSymbol = sectorToEtf(profile.sector);
  let benchmarkBars;
  try {
    benchmarkBars = await getHistoricalPrices(benchmarkSymbol);
  } catch {
    benchmarkSymbol = MARKET_BENCHMARK_SYMBOL;
    benchmarkBars = await getHistoricalPrices(MARKET_BENCHMARK_SYMBOL);
  }

  const { high: high52w, drawdown: drawdown52w } = drawdownFromHigh(stockBars, DAYS_52W);
  const { high: high90d, drawdown: drawdown90d } = drawdownFromHigh(stockBars, DAYS_90D);
  const { drawdown: benchmarkDrawdown52w } = drawdownFromHigh(benchmarkBars, DAYS_52W);
  const { drawdown: benchmarkDrawdown90d } = drawdownFromHigh(benchmarkBars, DAYS_90D);

  const beta = profile.beta && Number.isFinite(profile.beta) ? profile.beta : 1;

  const excess52w = drawdown52w - beta * benchmarkDrawdown52w;
  const excess90d = drawdown90d - beta * benchmarkDrawdown90d;
  const excessDrawdown = (excess52w + excess90d) / 2;

  const closes = stockBars.map((b) => b.close);
  const currentPrice = closes[closes.length - 1];
  const rsi14 = rsi(closes, 14) ?? 50;

  const sma50 = sma(closes, 50);
  const std50 = stddev(closes, 50);
  const priceBelowSma50By2Std =
    sma50 !== null && std50 !== null ? currentPrice < sma50 - STD_DEV_MULTIPLIER * std50 : false;

  const sma200 = sma(closes, 200);
  const std200 = stddev(closes, 200);
  const priceBelowSma200By2Std =
    sma200 !== null && std200 !== null ? currentPrice < sma200 - STD_DEV_MULTIPLIER * std200 : false;

  let excessDrawdownScore = clamp(
    (-excessDrawdown / MAX_EXPECTED_EXCESS_DRAWDOWN) * 100,
    0,
    100
  );
  if (rsi14 < RSI_OVERSOLD_THRESHOLD) excessDrawdownScore += RSI_OVERSOLD_BONUS;
  if (priceBelowSma50By2Std) excessDrawdownScore += SMA_DEVIATION_BONUS;
  if (priceBelowSma200By2Std) excessDrawdownScore += SMA_DEVIATION_BONUS;
  excessDrawdownScore = clamp(excessDrawdownScore, 0, 100);

  return {
    symbol,
    companyName: profile.companyName,
    sector: profile.sector,
    currentPrice,
    high52w,
    high90d,
    drawdown52w,
    drawdown90d,
    benchmarkSymbol,
    benchmarkDrawdown52w,
    benchmarkDrawdown90d,
    beta,
    excessDrawdown,
    rsi14,
    priceBelowSma50By2Std,
    priceBelowSma200By2Std,
    excessDrawdownScore,
  };
}
