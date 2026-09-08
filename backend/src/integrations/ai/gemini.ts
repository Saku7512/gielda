import axios from "axios";
import { env } from "../../config/env";
import { withRetry } from "../httpRetry";
import { parseClassificationJson } from "./parseClassification";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import type { AiClassifierClient, ClassificationInput, ClassificationOutput } from "./types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// Uwaga: nieprzetestowane na żywo (brak klucza w trakcie budowy) — zweryfikuj
// przed użyciem produkcyjnym, w tym slug modelu w env.geminiModel.
export class GeminiClient implements AiClassifierClient {
  async classify(input: ClassificationInput): Promise<ClassificationOutput> {
    if (!env.geminiApiKey) {
      throw new Error("GEMINI_API_KEY nie jest ustawiony w backend/.env");
    }

    const text = await withRetry(async () => {
      const response = await axios.post(
        `${BASE_URL}/models/${env.geminiModel}:generateContent`,
        {
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: buildUserPrompt(input) }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        },
        {
          params: { key: env.geminiApiKey },
          timeout: 30_000,
        }
      );
      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
    });

    if (!text) {
      throw new Error("Gemini: pusta odpowiedź modelu");
    }
    return parseClassificationJson(text, "Gemini");
  }
}
