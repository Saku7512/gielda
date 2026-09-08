import { env } from "../config/env";
import { saveScreenerResults } from "../db/screenerResultsRepository";
import { fmpRequestCount } from "../integrations/fmp";
import { finnhubRequestCount, getQuote } from "../integrations/finnhub";
import { classifyDrawdownCause } from "../scoring/aiClassifier";
import { computeCompositeScore, computeCompositeScorePartial } from "../scoring/compositeScore";
import { computeDrawdownScore } from "../scoring/drawdown";
import { computeFundamentalHealthScore } from "../scoring/fundamentals";
import type { CompositeScoreResult } from "../scoring/types";

interface ScreenerRow {
  ticker: string;
  livePrice: string;
  excessDrawdown: string;
  excessDrawdownScore: number;
  fundamentalHealthScore: number;
  aiCause: string;
  aiConfidence: string;
  compositeScore: string;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function screenSymbol(symbol: string): Promise<CompositeScoreResult> {
  const [drawdown, fundamentals] = await Promise.all([
    computeDrawdownScore(symbol),
    computeFundamentalHealthScore(symbol),
  ]);

  let aiClassification: CompositeScoreResult["aiClassification"] = null;
  try {
    aiClassification = await classifyDrawdownCause({
      symbol,
      companyName: drawdown.companyName,
      sector: drawdown.sector,
      priceDrawdownPct: drawdown.excessDrawdown,
    });
  } catch (error) {
    console.log(
      `  [Warstwa 3] ${symbol}: klasyfikacja AI nieudana (${
        error instanceof Error ? error.message : String(error)
      }) — używam composite_score_partial (bez AI).`
    );
  }

  const compositeScorePartial = computeCompositeScorePartial(drawdown, fundamentals);
  const compositeScore = aiClassification
    ? computeCompositeScore(drawdown, fundamentals, aiClassification.aiCauseWeight)
    : null;

  return { symbol, drawdown, fundamentals, aiClassification, compositeScorePartial, compositeScore };
}

async function main(): Promise<void> {
  console.log(`Screener startuje dla watchlisty: ${env.watchlist.join(", ")}`);
  console.log(`Dostawca AI (Warstwa 3): ${env.aiProvider}\n`);

  const rows: ScreenerRow[] = [];
  const results: CompositeScoreResult[] = [];
  const errors: { ticker: string; message: string }[] = [];

  for (const ticker of env.watchlist) {
    try {
      const result = await screenSymbol(ticker);
      results.push(result);
      let livePriceLabel = result.drawdown.currentPrice.toFixed(2);
      try {
        const quote = await getQuote(ticker);
        livePriceLabel = quote.c.toFixed(2);
      } catch {
        // Finnhub niedostępny/limit — używamy ceny z FMP jako fallback, bez przerywania.
      }

      rows.push({
        ticker,
        livePrice: livePriceLabel,
        excessDrawdown: formatPct(result.drawdown.excessDrawdown),
        excessDrawdownScore: Math.round(result.drawdown.excessDrawdownScore),
        fundamentalHealthScore: Math.round(result.fundamentals.fundamentalHealthScore),
        aiCause: result.aiClassification?.cause ?? "brak (błąd AI)",
        aiConfidence: result.aiClassification ? `${Math.round(result.aiClassification.confidence * 100)}%` : "-",
        compositeScore:
          result.compositeScore !== null
            ? Math.round(result.compositeScore * 10) / 10 + ""
            : `${Math.round(result.compositeScorePartial * 10) / 10} (partial)`,
      });
    } catch (error) {
      errors.push({ ticker, message: error instanceof Error ? error.message : String(error) });
    }
  }

  rows.sort((a, b) => parseFloat(b.compositeScore) - parseFloat(a.compositeScore));

  console.table(
    rows.map((r) => ({
      ticker: r.ticker,
      "cena (live)": r.livePrice,
      excess_drawdown: r.excessDrawdown,
      "excess_drawdown_score": r.excessDrawdownScore,
      fundamental_health: r.fundamentalHealthScore,
      ai_cause: r.aiCause,
      ai_confidence: r.aiConfidence,
      composite_score: r.compositeScore,
    }))
  );

  if (errors.length > 0) {
    console.log("\nBłędy dla części tickerów (pominięte w tabeli):");
    for (const err of errors) {
      console.log(`  ${err.ticker}: ${err.message}`);
    }
  }

  console.log(
    `\ncomposite_score to pełny wzór z CLAUDE.md (0.35*drawdown + 0.40*fundamenty + 0.25*ai_cause_weight, ` +
      `skala 0-100, próg kandydata: >70). Wiersze oznaczone "(partial)" nie mają wyniku Warstwy 3 ` +
      `(błąd/limit API AI) — pokazują tylko sumę Warstw 1+2 na skali 0-75.`
  );

  console.log(
    `\nZapytania w tym uruchomieniu — FMP: ${fmpRequestCount} (limit darmowy: 250/dzień), ` +
      `Finnhub: ${finnhubRequestCount} (limit darmowy: 60/min).`
  );

  try {
    const saved = await saveScreenerResults(results);
    console.log(
      saved
        ? `Zapisano ${results.length} wyników do Supabase (tabela screener_results).`
        : "Supabase nieskonfigurowane (brak SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY) — pominięto zapis."
    );
  } catch (error) {
    console.log(`Zapis do Supabase nieudany: ${error instanceof Error ? error.message : String(error)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Screener zakończył się błędem:", error);
    process.exit(1);
  });
