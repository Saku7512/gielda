export interface SectorRankingItem {
  sector: string;
  rank: number;
  score: number;
  reasoning: string;
}

export function parseSectorRankingJson(raw: string, providerName: string): SectorRankingItem[] {
  const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`${providerName}: odpowiedź rankingu sektorów nie jest poprawnym JSON-em: ${cleaned.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${providerName}: odpowiedź rankingu sektorów nie jest tablicą`);
  }

  return parsed.map((item, i) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`${providerName}: element ${i} rankingu sektorów nie jest obiektem`);
    }
    const { sector, rank, score, reasoning } = item as Record<string, unknown>;
    if (typeof sector !== "string" || sector.trim() === "") {
      throw new Error(`${providerName}: element ${i} ma nieprawidłowe "sector"`);
    }
    if (typeof rank !== "number") {
      throw new Error(`${providerName}: element ${i} ma nieprawidłowe "rank"`);
    }
    if (typeof score !== "number") {
      throw new Error(`${providerName}: element ${i} ma nieprawidłowe "score"`);
    }
    if (typeof reasoning !== "string" || reasoning.trim() === "") {
      throw new Error(`${providerName}: element ${i} ma nieprawidłowe "reasoning"`);
    }
    return { sector, rank, score: Math.min(100, Math.max(0, score)), reasoning };
  });
}
