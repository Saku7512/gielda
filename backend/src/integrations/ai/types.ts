export type DrawdownCause =
  | "market_overreaction"
  | "fundamental_deterioration"
  | "structural_geopolitical_risk";

export interface NewsHeadline {
  headline: string;
  summary: string;
  source: string;
  publishedAt: string;
}

export interface ClassificationInput {
  symbol: string;
  companyName: string;
  sector: string;
  priceDrawdownPct: number; // ułamek, np. -0.35
  newsHeadlines: NewsHeadline[];
}

export interface ClassificationOutput {
  cause: DrawdownCause;
  confidence: number; // 0-1
  reasoning: string;
}

export interface AiClassifierClient {
  classify(input: ClassificationInput): Promise<ClassificationOutput>;
  /** Surowe wywołanie system+user -> tekst odpowiedzi (JSON), do ponownego użycia poza klasyfikacją przyczyny (np. sectorRanking.ts). */
  completeJson(systemPrompt: string, userPrompt: string): Promise<string>;
}
