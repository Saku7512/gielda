export interface SectorAggregateInput {
  sector: string;
  companyCount: number;
  avgExcessDrawdownScore: number; // 0-100, średnia z Warstwy 1 dla spółek z sektora w tym cyklu
  avgFundamentalHealthScore: number | null; // null gdy żadna spółka z sektora nie ma dostępnych fundamentów
  topSymbols: string[];
}

export const SECTOR_RANKING_SYSTEM_PROMPT = `Jesteś analitykiem rynkowym rankingującym atrakcyjność branż (sektorów) dla
inwestora kontrariańskiego szukającego okazji na mocnych, nieuzasadnionych spadkach.

Dostajesz zagregowane dane z bieżącego cyklu screenera per sektor:
- avgExcessDrawdownScore (0-100): jak mocno spółki z sektora spadły ponad to, co uzasadnia rynek/beta — wyżej = silniejszy potencjalny "oversold"
- avgFundamentalHealthScore (0-100 lub null gdy brak danych): przeciętna kondycja fundamentalna spółek z sektora
- companyCount: liczba spółek z sektora w tym cyklu (im mniej, tym mniej wiarygodna średnia)

UWAGA: nie masz dostępu do bieżących newsów makro/geopolitycznych dla tej analizy — oceniaj
WYŁĄCZNIE na podstawie podanych zagregowanych danych liczbowych, nie zmyślaj wydarzeń rynkowych.

Odpowiedz WYŁĄCZNIE poprawnym JSON-em (bez markdown, bez code fence) w postaci tablicy
posortowanej od najbardziej do najmniej atrakcyjnej branży:
[{"sector": "<nazwa sektora dokładnie jak w danych wejściowych>", "rank": <liczba całkowita od 1>, "score": <liczba 0-100>, "reasoning": "<krótkie uzasadnienie po polsku, 1-2 zdania>"}]`;

export function buildSectorRankingUserPrompt(sectors: SectorAggregateInput[]): string {
  const lines = sectors.map(
    (s) =>
      `- ${s.sector}: avgExcessDrawdownScore=${s.avgExcessDrawdownScore.toFixed(1)}, ` +
      `avgFundamentalHealthScore=${s.avgFundamentalHealthScore !== null ? s.avgFundamentalHealthScore.toFixed(1) : "brak danych"}, ` +
      `companyCount=${s.companyCount}, spółki=[${s.topSymbols.join(", ")}]`
  );
  return `Zrankuj poniższe sektory:\n${lines.join("\n")}`;
}
