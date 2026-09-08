import { env } from "../config/env";
import { saveScreenerResults } from "../db/screenerResultsRepository";
import { saveSectorRankings } from "../db/sectorRankingsRepository";
import { eodhdRequestCount } from "../integrations/eodhd";
import { fmpRequestCount } from "../integrations/fmp";
import { finnhubRequestCount, getQuote } from "../integrations/finnhub";
import { classifyDrawdownCause } from "../scoring/aiClassifier";
import { computeCompositeScore } from "../scoring/compositeScore";
import { computeDrawdownScore, computeDrawdownScoreEodhd } from "../scoring/drawdown";
import { computeFundamentalHealthScore, unavailableFundamentalHealth } from "../scoring/fundamentals";
import { rankSectors } from "../scoring/sectorRanking";
import type { CompositeScoreResult, DrawdownScoreResult, FundamentalHealthResult, Market } from "../scoring/types";

interface ScreenerRow {
  ticker: string;
  market: Market;
  livePrice: string;
  excessDrawdown: string;
  excessDrawdownScore: number;
  fundamentalHealthScore: string;
  aiCause: string;
  aiConfidence: string;
  compositeScore: string;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function computeDrawdownAndFundamentals(
  ticker: string,
  market: Market
): Promise<{ drawdown: DrawdownScoreResult; fundamentals: FundamentalHealthResult }> {
  if (market === "US") {
    const [drawdown, fundamentals] = await Promise.all([
      computeDrawdownScore(ticker),
      computeFundamentalHealthScore(ticker),
    ]);
    return { drawdown, fundamentals };
  }

  const drawdown = await computeDrawdownScoreEodhd(ticker, market);
  const fundamentals = unavailableFundamentalHealth(
    ticker,
    "EODHD: fundamenty niedostępne na darmowym planie dla rynków PL/EU (403 - tylko EOD)"
  );
  return { drawdown, fundamentals };
}

async function screenSymbol(ticker: string, market: Market): Promise<CompositeScoreResult> {
  const { drawdown, fundamentals } = await computeDrawdownAndFundamentals(ticker, market);

  let aiClassification: CompositeScoreResult["aiClassification"] = null;
  try {
    aiClassification = await classifyDrawdownCause({
      symbol: ticker,
      companyName: drawdown.companyName,
      sector: drawdown.sector,
      market,
      priceDrawdownPct: drawdown.excessDrawdown,
    });
  } catch (error) {
    console.log(
      `  [Warstwa 3] ${ticker}: klasyfikacja AI nieudana (${
        error instanceof Error ? error.message : String(error)
      }).`
    );
  }

  const scoreBreakdown = computeCompositeScore(
    drawdown,
    fundamentals,
    aiClassification?.aiCauseWeight ?? null
  );

  return { symbol: ticker, drawdown, fundamentals, aiClassification, scoreBreakdown };
}

async function main(): Promise<void> {
  const allMarketWatchlists: { market: Market; tickers: string[] }[] = [
    { market: "US", tickers: env.watchlistUs },
    { market: "PL", tickers: env.watchlistPl },
    { market: "EU", tickers: env.watchlistEu },
  ];
  const marketWatchlists = allMarketWatchlists.filter((w) => w.tickers.length > 0);

  console.log(
    `Screener startuje: ${marketWatchlists.map((w) => `${w.market}=[${w.tickers.join(", ")}]`).join(" | ")}`
  );
  console.log(`Dostawca AI (Warstwa 3): ${env.aiProvider}\n`);

  const rows: ScreenerRow[] = [];
  const results: CompositeScoreResult[] = [];
  const errors: { ticker: string; message: string }[] = [];

  for (const { market, tickers } of marketWatchlists) {
    for (const ticker of tickers) {
      try {
        const result = await screenSymbol(ticker, market);
        results.push(result);

        let livePriceLabel = result.drawdown.currentPrice.toFixed(2);
        if (market === "US") {
          try {
            const quote = await getQuote(ticker);
            livePriceLabel = quote.c.toFixed(2);
          } catch {
            // Finnhub niedostępny/limit — używamy ceny z FMP jako fallback, bez przerywania.
          }
        }

        rows.push({
          ticker,
          market,
          livePrice: livePriceLabel,
          excessDrawdown: formatPct(result.drawdown.excessDrawdown),
          excessDrawdownScore: Math.round(result.drawdown.excessDrawdownScore),
          fundamentalHealthScore: result.fundamentals.available
            ? String(Math.round(result.fundamentals.fundamentalHealthScore ?? 0))
            : "brak danych",
          aiCause: result.aiClassification?.cause ?? "brak (błąd AI)",
          aiConfidence: result.aiClassification ? `${Math.round(result.aiClassification.confidence * 100)}%` : "-",
          compositeScore: `${Math.round(result.scoreBreakdown.total * 10) / 10}/${Math.round(result.scoreBreakdown.max)}`,
        });
      } catch (error) {
        errors.push({ ticker: `${market}:${ticker}`, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  rows.sort((a, b) => parseFloat(b.compositeScore) - parseFloat(a.compositeScore));

  console.table(
    rows.map((r) => ({
      rynek: r.market,
      ticker: r.ticker,
      "cena (live)": r.livePrice,
      excess_drawdown: r.excessDrawdown,
      excess_drawdown_score: r.excessDrawdownScore,
      fundamental_health: r.fundamentalHealthScore,
      ai_cause: r.aiCause,
      ai_confidence: r.aiConfidence,
      "composite_score/max": r.compositeScore,
    }))
  );

  if (errors.length > 0) {
    console.log("\nBłędy dla części tickerów (pominięte w tabeli):");
    for (const err of errors) {
      console.log(`  ${err.ticker}: ${err.message}`);
    }
  }

  console.log(
    `\ncomposite_score/max: suma dostępnych warstw (0.35*drawdown + 0.40*fundamenty[jeśli dostępne] + ` +
      `0.25*ai[jeśli dostępne]) na tle maksimum możliwego przy dostępnych warstwach. Dla PL/EU fundamenty ` +
      `są niedostępne (plan EODHD), więc max wynosi 60/100 zamiast 100/100 — to nie błąd.`
  );

  console.log(
    `\nZapytania w tym uruchomieniu — FMP: ${fmpRequestCount} (limit: 250/dzień), ` +
      `Finnhub: ${finnhubRequestCount} (limit: 60/min), EODHD: ${eodhdRequestCount} (limit: ~20/dzień).`
  );

  try {
    const saved = await saveScreenerResults(results);
    console.log(
      saved
        ? `Zapisano ${results.length} wyników do Supabase (tabela screener_results).`
        : "Supabase nieskonfigurowane — pominięto zapis wyników."
    );
  } catch (error) {
    console.log(`Zapis wyników do Supabase nieudany: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Warstwa 0 — ranking branż na bazie bieżącego cyklu (patrz sectorRanking.ts).
  try {
    const sectorRankings = await rankSectors(results);
    if (sectorRankings.length > 0) {
      console.log("\nRanking branż (Warstwa 0):");
      console.table(
        sectorRankings
          .sort((a, b) => a.rank - b.rank)
          .map((s) => ({ rank: s.rank, sektor: s.sector, score: s.score, uzasadnienie: s.reasoning }))
      );
      const savedRankings = await saveSectorRankings(sectorRankings);
      console.log(
        savedRankings
          ? `Zapisano ranking ${sectorRankings.length} branż do Supabase (tabela sector_rankings).`
          : "Supabase nieskonfigurowane — pominięto zapis rankingu branż."
      );
    } else {
      console.log("\nRanking branż pominięty (brak spółek z przypisanym sektorem w tym cyklu).");
    }
  } catch (error) {
    console.log(`\nRanking branż nieudany: ${error instanceof Error ? error.message : String(error)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Screener zakończył się błędem:", error);
    process.exit(1);
  });
