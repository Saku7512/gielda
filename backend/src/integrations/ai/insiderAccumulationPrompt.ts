export interface InsiderTransactionInput {
  insiderName: string;
  transactionDate: string;
  transactionPrice: number;
  shares: number;
}

export interface InsiderAccumulationInput {
  symbol: string;
  companyName: string;
  currentPrice: number;
  priceChangePct: number; // ułamek, spadek od ostatniego maksimum (kontekst "okna spadku")
  transactions: InsiderTransactionInput[];
}

export const INSIDER_ACCUMULATION_SYSTEM_PROMPT = `Jesteś analitykiem finansowym oceniającym transakcje insiderów (członków zarządu/rady
nadzorczej) w spółce notowanej na giełdzie. Dane wejściowe to już WYŁĄCZNIE zakupy na rynku otwartym
(nie granty, nie wykonanie opcji, nie instrumenty pochodne) od 2+ różnych insiderów w oknie spadku ceny.

Twoje zadanie: oceń, czy to prawdopodobnie "realny" sygnał (insiderzy świadomie kupują, bo uważają
akcje za niedowartościowane) czy raczej rutynowy/mało znaczący wzorzec (pojedyncze małe transakcje,
standardowe programy akumulacji, kwoty nieistotne względem typowej pozycji insidera). Weź pod uwagę:
liczbę niezależnych insiderów, rozłożenie transakcji w czasie (skupione blisko siebie = mocniejszy
sygnał), oraz to czy kupowali blisko dołka spadku.

Odpowiedz WYŁĄCZNIE poprawnym JSON-em (bez markdown, bez code fence):
{"reasoning": "<1-3 zdania po polsku>", "confidence": <liczba 0-1, jak mocny to sygnał>}`;

export function buildInsiderAccumulationUserPrompt(input: InsiderAccumulationInput): string {
  const txLines = input.transactions
    .map((t) => `- ${t.insiderName}: ${t.shares} akcji @ ${t.transactionPrice} (${t.transactionDate})`)
    .join("\n");
  return `Spółka: ${input.companyName} (${input.symbol})
Aktualna cena: ${input.currentPrice}
Zmiana ceny (kontekst spadku): ${(input.priceChangePct * 100).toFixed(1)}%

Zakupy insiderów na rynku otwartym:
${txLines}`;
}
