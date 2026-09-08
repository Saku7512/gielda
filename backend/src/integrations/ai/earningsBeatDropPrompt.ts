export interface EarningsBeatDropInput {
  symbol: string;
  companyName: string;
  earningsDate: string;
  epsActual: number;
  epsEstimated: number;
  priceChangePct: number; // ułamek, ujemny = spadek po publikacji
}

// Uwaga (na prośbę użytkownika): fokus tego promptu to WYJAŚNIENIE dlaczego
// rynek zignorował dobre wyniki, nie tylko przypisanie do stałej kategorii
// przyczyny (w przeciwieństwie do promptu Warstwy 3 dla overreactedDrawdown).
export const EARNINGS_BEAT_DROP_SYSTEM_PROMPT = `Jesteś analitykiem finansowym. Spółka pobiła oczekiwania rynku co do EPS
(wynik lepszy niż estymowany), a mimo to jej cena spadła w kilka dni po publikacji wyników.

Twoje zadanie: wyjaśnij, DLACZEGO rynek mógł zignorować lub negatywnie zareagować na dobre wyniki,
zamiast po prostu sklasyfikować przyczynę do sztywnej kategorii. Rozważ typowe scenariusze: obniżone
guidance na przyszłość mimo dobrego kwartału, wynik "napompowany" jednorazowym zdarzeniem, wycena już
uwzględniająca dobry wynik przed publikacją (sell the news), słabsze dane w innych metrykach (marże,
przepływy), ogólna wyprzedaż sektora/rynku w tym okresie niezwiązana z wynikami spółki.

NIE zmyślaj konkretnych faktów (np. treści guidance), których nie masz w danych wejściowych —
formułuj to jako prawdopodobne hipotezy na podstawie samej rozbieżności między wynikiem a reakcją ceny.

Odpowiedz WYŁĄCZNIE poprawnym JSON-em (bez markdown, bez code fence):
{"reasoning": "<1-3 zdania po polsku wyjaśniające prawdopodobną przyczynę>", "confidence": <liczba 0-1>}`;

export function buildEarningsBeatDropUserPrompt(input: EarningsBeatDropInput): string {
  const beatPct = ((input.epsActual - input.epsEstimated) / Math.abs(input.epsEstimated)) * 100;
  return `Spółka: ${input.companyName} (${input.symbol})
Data publikacji wyników: ${input.earningsDate}
EPS: ${input.epsActual} (estymacja: ${input.epsEstimated}, beat o ${beatPct.toFixed(1)}%)
Zmiana ceny w oknie 3-5 dni po publikacji: ${(input.priceChangePct * 100).toFixed(1)}%`;
}
