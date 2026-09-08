import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env";
import { parseClassificationJson } from "./parseClassification";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import type { AiClassifierClient, ClassificationInput, ClassificationOutput } from "./types";

// Uwaga: nieprzetestowane na żywo (brak klucza w trakcie budowy) — zweryfikuj
// przed użyciem produkcyjnym, w tym slug modelu w env.anthropicModel.
export class AnthropicClient implements AiClassifierClient {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!env.anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY nie jest ustawiony w backend/.env");
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey: env.anthropicApiKey });
    }
    return this.client;
  }

  async completeJson(systemPrompt: string, userPrompt: string): Promise<string> {
    const message = await this.getClient().messages.create({
      model: env.anthropicModel,
      max_tokens: 1024,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Anthropic: odpowiedź nie zawiera bloku tekstowego");
    }
    return textBlock.text;
  }

  async classify(input: ClassificationInput): Promise<ClassificationOutput> {
    const text = await this.completeJson(SYSTEM_PROMPT, buildUserPrompt(input));
    return parseClassificationJson(text, "Anthropic");
  }
}
