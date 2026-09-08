import { getAiClassifierClient } from "../integrations/ai";
import type { DrawdownCause } from "../integrations/ai/types";
import { getCompanyNews } from "../integrations/finnhub";
import type { AiClassificationResult, Market } from "./types";

// Wagi z CLAUDE.md (sekcja "Warstwa 3"): market_overreaction -> wysoka waga
// pozytywna, fundamental_deterioration -> odrzucić, structural_geopolitical_risk
// -> odrzucić/mocno obniżyć. Skala 0-100, żeby pasować do reszty compositeScore.
const CAUSE_WEIGHTS: Record<DrawdownCause, number> = {
  market_overreaction: 90,
  structural_geopolitical_risk: 20,
  fundamental_deterioration: 5,
};

const NEWS_LOOKBACK_DAYS = 14;
const MAX_NEWS_HEADLINES = 8;

async function fetchNewsHeadlines(symbol: string, market: Market) {
  // Finnhub /company-news jest de facto rynkiem US — dla PL/EU zwraca błąd
  // (zweryfikowane empirycznie), więc nie marnujemy na to zapytania.
  if (market !== "US") return [];
  try {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - NEWS_LOOKBACK_DAYS);
    const news = await getCompanyNews(
      symbol,
      from.toISOString().slice(0, 10),
      to.toISOString().slice(0, 10)
    );
    return news.slice(0, MAX_NEWS_HEADLINES).map((n) => ({
      headline: n.headline,
      summary: n.summary,
      source: n.source,
      publishedAt: new Date(n.datetime * 1000).toISOString().slice(0, 10),
    }));
  } catch {
    // Brak FINNHUB_API_KEY lub błąd zapytania — klasyfikujemy bez kontekstu
    // newsowego zamiast przerywać całą Warstwę 3 dla tego tickera.
    return [];
  }
}

export async function classifyDrawdownCause(params: {
  symbol: string;
  companyName: string;
  sector: string | null;
  market: Market;
  priceDrawdownPct: number;
}): Promise<AiClassificationResult> {
  const newsHeadlines = await fetchNewsHeadlines(params.symbol, params.market);
  const client = getAiClassifierClient();

  const result = await client.classify({
    symbol: params.symbol,
    companyName: params.companyName,
    sector: params.sector ?? "nieznany",
    priceDrawdownPct: params.priceDrawdownPct,
    newsHeadlines,
  });

  return {
    symbol: params.symbol,
    cause: result.cause,
    confidence: result.confidence,
    reasoning: result.reasoning,
    aiCauseWeight: CAUSE_WEIGHTS[result.cause],
  };
}
