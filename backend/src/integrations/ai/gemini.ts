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
  async completeJson(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!env.geminiApiKey) {
      throw new Error("GEMINI_API_KEY nie jest ustawiony w backend/.env");
    }

    const text = await withRetry(async () => {
      const response = await axios.post(
        `${BASE_URL}/models/${env.geminiModel}:generateContent`,
        {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
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
    return text;
  }

  async classify(input: ClassificationInput): Promise<ClassificationOutput> {
    const text = await this.completeJson(SYSTEM_PROMPT, buildUserPrompt(input));
    return parseClassificationJson(text, "Gemini");
  }
}
