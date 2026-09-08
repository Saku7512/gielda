import { CLASSIFICATION_CAUSES } from "./prompt";
import type { ClassificationOutput } from "./types";

/** Parsuje i waliduje surową odpowiedź modelu (JSON, ewentualnie w ```json fence). */
export function parseClassificationJson(raw: string, providerName: string): ClassificationOutput {
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

  const { cause, confidence, reasoning } = parsed as Record<string, unknown>;

  if (typeof cause !== "string" || !CLASSIFICATION_CAUSES.includes(cause as never)) {
    throw new Error(`${providerName}: nieprawidłowa wartość "cause": ${String(cause)}`);
  }
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    throw new Error(`${providerName}: nieprawidłowa wartość "confidence": ${String(confidence)}`);
  }
  if (typeof reasoning !== "string" || reasoning.trim() === "") {
    throw new Error(`${providerName}: brak "reasoning" w odpowiedzi`);
  }

  return {
    cause: cause as ClassificationOutput["cause"],
    confidence: Math.min(1, Math.max(0, confidence)),
    reasoning,
  };
}
