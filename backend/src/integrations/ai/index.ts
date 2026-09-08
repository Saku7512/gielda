import { env } from "../../config/env";
import { AnthropicClient } from "./anthropic";
import { DeepSeekClient } from "./deepseek";
import { GeminiClient } from "./gemini";
import type { AiClassifierClient } from "./types";

/**
 * Wybór dostawcy AI dla Warstwy 3 (klasyfikacja przyczyny spadku) sterowany
 * przez AI_PROVIDER w .env — pozwala przełączać się między DeepSeek/Claude/
 * Gemini bez zmian w kodzie scoringu.
 */
export function getAiClassifierClient(): AiClassifierClient {
  switch (env.aiProvider) {
    case "deepseek":
      return new DeepSeekClient();
    case "anthropic":
      return new AnthropicClient();
    case "gemini":
      return new GeminiClient();
  }
}

export type { AiClassifierClient, ClassificationInput, ClassificationOutput, DrawdownCause } from "./types";
