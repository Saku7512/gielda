export interface ReasoningOutput {
  reasoning: string;
  confidence: number; // 0-1
}

/** Wspólny parser dla promptów zwracających tylko {reasoning, confidence} (Strategie B/C). */
export function parseReasoningJson(raw: string, providerName: string): ReasoningOutput {
  const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`${providerName}: odpowiedź nie jest poprawnym JSON-em: ${cleaned.slice(0, 200)}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${providerName}: odpowiedź JSON nie jest obiektem`);
  }
  const { reasoning, confidence } = parsed as Record<string, unknown>;
  if (typeof reasoning !== "string" || reasoning.trim() === "") {
    throw new Error(`${providerName}: brak "reasoning" w odpowiedzi`);
  }
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    throw new Error(`${providerName}: nieprawidłowa wartość "confidence"`);
  }
  return { reasoning, confidence: Math.min(1, Math.max(0, confidence)) };
}
