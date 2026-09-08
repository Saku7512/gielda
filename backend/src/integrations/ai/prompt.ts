import type { ClassificationInput, DrawdownCause } from "./types";

export const CLASSIFICATION_CAUSES: DrawdownCause[] = [
  "market_overreaction",
  "fundamental_deterioration",
  "structural_geopolitical_risk",
];

export const SYSTEM_PROMPT = `Jesteś analitykiem finansowym klasyfikującym przyczynę spadku ceny akcji.
Na podstawie podanych informacji o spółce oraz ostatnich nagłówków newsowych, przypisz przyczynę spadku
do JEDNEJ z trzech kategorii:

- market_overreaction: panika sektorowa/ogólny negatywny sentyment rynkowy, jednorazowy negatywny nagłówek
  bez realnego wpływu na fundamenty spółki — spadek jest prawdopodobnie przesadzony i odwracalny.
- fundamental_deterioration: obniżka prognoz, utrata istotnego kontraktu, problem z zadłużeniem lub inne
  pogorszenie fundamentów uzasadniające spadek.
- structural_geopolitical_risk: trwałe sankcje, cła, zmiana regulacji lub inne trwałe ryzyko strukturalne/
  geopolityczne uzasadniające spadek.

Odpowiedz WYŁĄCZNIE poprawnym obiektem JSON (bez markdown, bez code fence, bez dodatkowego tekstu) o kształcie:
{"cause": "market_overreaction" | "fundamental_deterioration" | "structural_geopolitical_risk", "confidence": <liczba 0-1>, "reasoning": "<krótkie uzasadnienie po polsku>"}`;

export function buildUserPrompt(input: ClassificationInput): string {
  const newsSection =
    input.newsHeadlines.length > 0
      ? input.newsHeadlines
          .map((n, i) => `${i + 1}. [${n.publishedAt}, ${n.source}] ${n.headline}\n   ${n.summary}`)
          .join("\n")
      : "Brak dostępnych newsów z ostatniego okresu — oceń na podstawie samej skali spadku i sektora.";

  return `Spółka: ${input.companyName} (${input.symbol})
Sektor: ${input.sector}
Spadek ceny (excess drawdown vs. benchmark, beta-adjusted): ${(input.priceDrawdownPct * 100).toFixed(1)}%

Ostatnie newsy:
${newsSection}`;
}
