import axios from "axios";
import { env } from "../../config/env";
import { withRetry } from "../httpRetry";
import { parseClassificationJson } from "./parseClassification";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import type { AiClassifierClient, ClassificationInput, ClassificationOutput } from "./types";

// DeepSeek ma API kompatybilne z formatem OpenAI Chat Completions.
const BASE_URL = "https://api.deepseek.com";

export class DeepSeekClient implements AiClassifierClient {
  async completeJson(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!env.deepseekApiKey) {
      throw new Error("DEEPSEEK_API_KEY nie jest ustawiony w backend/.env");
    }

    const content = await withRetry(async () => {
      const response = await axios.post(
        `${BASE_URL}/chat/completions`,
        {
          model: env.deepseekModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          response_format: { type: "json_object" },
        },
        {
          headers: { Authorization: `Bearer ${env.deepseekApiKey}` },
          timeout: 30_000,
        }
      );
      return response.data?.choices?.[0]?.message?.content as string | undefined;
    });

    if (!content) {
      throw new Error("DeepSeek: pusta odpowiedź modelu");
    }
    return content;
  }

  async classify(input: ClassificationInput): Promise<ClassificationOutput> {
    const content = await this.completeJson(SYSTEM_PROMPT, buildUserPrompt(input));
    return parseClassificationJson(content, "DeepSeek");
  }
}
