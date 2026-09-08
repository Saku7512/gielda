import {
  getBalanceSheet,
  getCashFlowStatement,
  getIncomeStatement,
  getKeyMetrics,
  getRatios,
} from "../integrations/fmp";
import type { FundamentalCheck, FundamentalHealthResult } from "./types";

// Brak dostępu do danych peer-group w MVP (odłożone na później — patrz
// CLAUDE.md sekcja MVP), więc wycenę porównujemy tylko do własnej 5-letniej
// średniej, nie do grupy porównawczej.
const DEBT_TO_EBITDA_MAX = 3.5; // stały próg zastępczy zamiast "normy branżowej"
const INTEREST_COVERAGE_MIN = 3;
const QUARTERLY_TREND_TOLERANCE = 0.95; // dopuszczalny spadek 5% bez odrzucenia trendu

function average(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

export async function computeFundamentalHealthScore(symbol: string): Promise<FundamentalHealthResult> {
  const [incomeAnnual, incomeQuarterly, balanceAnnual, cashFlowAnnual, keyMetricsAnnual, ratiosAnnual] =
    await Promise.all([
      getIncomeStatement(symbol, "annual", 5),
      getIncomeStatement(symbol, "quarter", 4),
      getBalanceSheet(symbol, "annual", 1),
      getCashFlowStatement(symbol, "annual", 1),
      getKeyMetrics(symbol, "annual", 5),
      getRatios(symbol, "annual", 5),
    ]);

  const checks: FundamentalCheck[] = [];

  if (
    incomeAnnual.length === 0 ||
    balanceAnnual.length === 0 ||
    cashFlowAnnual.length === 0 ||
    keyMetricsAnnual.length === 0 ||
    ratiosAnnual.length === 0
  ) {
    throw new Error(`FMP: niekompletne dane fundamentalne dla ${symbol}`);
  }

  const latestIncome = incomeAnnual[0];
  const latestBalance = balanceAnnual[0];
  const latestCashFlow = cashFlowAnnual[0];
  const latestRatios = ratiosAnnual[0];

  // --- Rentowność ---
  const roa = latestIncome.netIncome / latestBalance.totalAssets;
  checks.push({
    name: "ROA > 0",
    passed: roa > 0,
    detail: `ROA = ${(roa * 100).toFixed(1)}%`,
  });

  checks.push({
    name: "Operacyjny cash flow > 0",
    passed: latestCashFlow.operatingCashFlow > 0,
    detail: `OCF = ${latestCashFlow.operatingCashFlow.toLocaleString()}`,
  });

  checks.push({
    name: "Cash flow > zysk netto (jakość zysków)",
    passed: latestCashFlow.operatingCashFlow > latestCashFlow.netIncome,
    detail: `OCF ${latestCashFlow.operatingCashFlow.toLocaleString()} vs NI ${latestCashFlow.netIncome.toLocaleString()}`,
  });

  // --- Zadłużenie ---
  const debtToEbitda = latestIncome.ebitda > 0 ? latestBalance.totalDebt / latestIncome.ebitda : Infinity;
  checks.push({
    name: `Debt/EBITDA <= ${DEBT_TO_EBITDA_MAX}`,
    passed: debtToEbitda <= DEBT_TO_EBITDA_MAX,
    detail: `Debt/EBITDA = ${debtToEbitda.toFixed(2)}`,
  });

  // FMP zwraca interestCoverageRatio = 0, gdy spółka nie ma odsetkowego kosztu
  // netto (np. Apple) — to nie to samo co "słabe pokrycie odsetek", więc 0
  // traktujemy jako brak obciążenia odsetkowego (checks passed).
  const interestCoverage = latestRatios.interestCoverageRatio;
  const interestCoverageOk =
    Number.isFinite(interestCoverage) &&
    (interestCoverage === 0 || interestCoverage > INTEREST_COVERAGE_MIN);
  checks.push({
    name: `Interest coverage > ${INTEREST_COVERAGE_MIN}x (lub brak odsetek netto)`,
    passed: interestCoverageOk,
    detail: Number.isFinite(interestCoverage) ? `${interestCoverage.toFixed(1)}x` : "brak danych",
  });

  const currentRatio = latestBalance.totalCurrentAssets / latestBalance.totalCurrentLiabilities;
  checks.push({
    name: "Current ratio > 1",
    passed: currentRatio > 1,
    detail: `${currentRatio.toFixed(2)}`,
  });

  // --- Trend (ostatnie 4 kwartały) ---
  if (incomeQuarterly.length >= 2) {
    const newestQuarter = incomeQuarterly[0];
    const oldestQuarter = incomeQuarterly[incomeQuarterly.length - 1];
    const revenueTrendOk = newestQuarter.revenue >= oldestQuarter.revenue * QUARTERLY_TREND_TOLERANCE;

    const newestMargin = newestQuarter.operatingIncome / newestQuarter.revenue;
    const oldestMargin = oldestQuarter.operatingIncome / oldestQuarter.revenue;
    const marginTrendOk = newestMargin >= oldestMargin * QUARTERLY_TREND_TOLERANCE;

    checks.push({
      name: "Przychody stabilne/rosnące (4 kw.)",
      passed: revenueTrendOk,
      detail: `${oldestQuarter.revenue.toLocaleString()} -> ${newestQuarter.revenue.toLocaleString()}`,
    });
    checks.push({
      name: "Marża operacyjna stabilna/rosnąca (4 kw.)",
      passed: marginTrendOk,
      detail: `${(oldestMargin * 100).toFixed(1)}% -> ${(newestMargin * 100).toFixed(1)}%`,
    });
  } else {
    checks.push({ name: "Przychody stabilne/rosnące (4 kw.)", passed: false, detail: "brak danych" });
    checks.push({ name: "Marża operacyjna stabilna/rosnąca (4 kw.)", passed: false, detail: "brak danych" });
  }

  // --- Wycena vs własna 5-letnia średnia (bez peer group w MVP) ---
  const peValues = ratiosAnnual.map((r) => r.priceToEarningsRatio);
  const currentPe = peValues[0];
  const avgPe5y = average(peValues.slice(1));

  const evToEbitdaValues = keyMetricsAnnual.map((m) => m.evToEBITDA);
  const currentEvToEbitda = evToEbitdaValues[0];
  const avgEvToEbitda5y = average(evToEbitdaValues.slice(1));

  const valuationOk =
    avgPe5y !== null &&
    avgEvToEbitda5y !== null &&
    Number.isFinite(currentPe) &&
    Number.isFinite(currentEvToEbitda) &&
    currentPe > 0 &&
    currentPe < avgPe5y &&
    currentEvToEbitda < avgEvToEbitda5y;

  checks.push({
    name: "P/E i EV/EBITDA poniżej własnej 5y średniej",
    passed: valuationOk,
    detail:
      avgPe5y !== null && avgEvToEbitda5y !== null
        ? `P/E ${currentPe.toFixed(1)} vs śr. ${avgPe5y.toFixed(1)}; EV/EBITDA ${currentEvToEbitda.toFixed(1)} vs śr. ${avgEvToEbitda5y.toFixed(1)}`
        : "brak wystarczających danych historycznych",
  });

  const fundamentalHealthScore = (checks.filter((c) => c.passed).length / checks.length) * 100;

  return { symbol, available: true, checks, fundamentalHealthScore };
}

/**
 * PL/EU: darmowy plan EODHD zwraca 403 na /fundamentals ("Only EOD data
 * allowed for free users") — Warstwa 2 nie może się wykonać. Zwracamy to
 * jawnie zamiast fabrykować dane, żeby compositeScore mógł to poprawnie
 * pominąć (patrz compositeScore.ts).
 */
export function unavailableFundamentalHealth(symbol: string, reason: string): FundamentalHealthResult {
  return { symbol, available: false, checks: [], fundamentalHealthScore: null, unavailableReason: reason };
}
