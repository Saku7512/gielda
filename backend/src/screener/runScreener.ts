import { env } from "../config/env";
import { saveScreenerResults } from "../db/screenerResultsRepository";
import { saveSectorRankings } from "../db/sectorRankingsRepository";
import { eodhdRequestCount } from "../integrations/eodhd";
import { fmpRequestCount } from "../integrations/fmp";
import { finnhubRequestCount } from "../integrations/finnhub";
import { rankSectors } from "../scoring/sectorRanking";
import type { Market } from "../scoring/types";
import { ACTIVE_STRATEGIES } from "./strategies";
import type { ScreenerCandidate } from "./strategies/types";

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
  console.log(`Strategie: ${ACTIVE_STRATEGIES.map((s) => s.label).join(", ")}`);
  console.log(`Dostawca AI: ${env.aiProvider}\n`);

  const candidates: ScreenerCandidate[] = [];

  for (const strategy of ACTIVE_STRATEGIES) {
    for (const { market, tickers } of marketWatchlists) {
      try {
        const found = await strategy.screen(tickers, market);
        candidates.push(...found);
      } catch (error) {
        console.log(
          `  [${strategy.label}/${market}] błąd całej strategii: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  candidates.sort((a, b) => b.score / b.scoreMax - a.score / a.scoreMax);

  console.table(
    candidates.map((c) => ({
      strategia: c.strategy,
      rynek: c.market,
      ticker: c.symbol,
      cena: c.currentPrice.toFixed(2),
      trigger: c.triggerDetail,
      fundamenty: c.fundamentalAvailable && c.fundamentalHealthScore !== null ? c.fundamentalHealthScore.toFixed(0) : "brak danych",
      "score/max": `${c.score.toFixed(1)}/${c.scoreMax}`,
    }))
  );

  if (candidates.length === 0) {
    console.log("\nBrak kandydatów w tym cyklu (żadna strategia nie wykryła triggera).");
  }

  console.log(
    `\nZapytania w tym uruchomieniu — FMP: ${fmpRequestCount} (limit: 250/dzień), ` +
      `Finnhub: ${finnhubRequestCount} (limit: 60/min), EODHD: ${eodhdRequestCount} (limit: ~20/dzień).`
  );

  try {
    const saved = await saveScreenerResults(candidates);
    console.log(
      saved
        ? `Zapisano ${candidates.length} kandydatów do Supabase (tabela screener_results).`
        : "Supabase nieskonfigurowane — pominięto zapis wyników."
    );
  } catch (error) {
    console.log(`Zapis wyników do Supabase nieudany: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Warstwa 0 — ranking branż, tylko na bazie kandydatów Strategii A (patrz sectorRanking.ts).
  try {
    const sectorRankings = await rankSectors(candidates);
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
      console.log("\nRanking branż pominięty (brak kandydatów Strategii A z przypisanym sektorem).");
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
