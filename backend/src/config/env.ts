import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Brak wymaganej zmiennej środowiskowej ${name}. Sprawdź plik backend/.env (patrz .env.example).`
    );
  }
  return value;
}

function parseWatchlist(raw: string): string[] {
  return raw
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter((ticker) => ticker.length > 0);
}

function optionalEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : null;
}

export type AiProvider = "deepseek" | "anthropic" | "gemini";

function parseAiProvider(raw: string | undefined): AiProvider {
  const value = (raw ?? "deepseek").trim().toLowerCase();
  if (value === "deepseek" || value === "anthropic" || value === "gemini") return value;
  throw new Error(
    `AI_PROVIDER="${raw}" nie jest obsługiwane. Użyj jednej z wartości: deepseek, anthropic, gemini.`
  );
}

export const env = {
  // Opcjonalny na tym etapie: brak klucza wyłącza tylko live quote z Finnhub
  // (runScreener wtedy używa ceny zamknięcia z FMP) i news dla Warstwy 3.
  finnhubApiKey: optionalEnv("FINNHUB_API_KEY"),
  fmpApiKey: requireEnv("FMP_API_KEY"),
  screenerCron: process.env.SCREENER_CRON ?? "0 * 14-21 * * 1-5",
  watchlist: parseWatchlist(process.env.WATCHLIST ?? ""),

  // Warstwa 3 (klasyfikacja AI) — dostawca wybieralny przez AI_PROVIDER, żeby
  // łatwo przełączać się między DeepSeek/Claude/Gemini bez zmian w kodzie.
  aiProvider: parseAiProvider(process.env.AI_PROVIDER),
  deepseekApiKey: optionalEnv("DEEPSEEK_API_KEY"),
  deepseekModel: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
  anthropicApiKey: optionalEnv("ANTHROPIC_API_KEY"),
  // Zweryfikuj aktualny slug modelu w dokumentacji Anthropic przed użyciem na produkcji.
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  geminiApiKey: optionalEnv("GEMINI_API_KEY"),
  // Zweryfikuj aktualny slug modelu w Google AI Studio przed użyciem na produkcji.
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",

  // Opcjonalne na tym etapie: brak konfiguracji wyłącza tylko zapis do Supabase
  // (runScreener dalej wypisuje tabelę w konsoli).
  supabaseUrl: optionalEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: optionalEnv("SUPABASE_SERVICE_ROLE_KEY"),
};

if (env.watchlist.length === 0) {
  throw new Error(
    "WATCHLIST w backend/.env jest pusta. Podaj listę tickerów oddzielonych przecinkami."
  );
}

const aiKeyByProvider: Record<AiProvider, string | null> = {
  deepseek: env.deepseekApiKey,
  anthropic: env.anthropicApiKey,
  gemini: env.geminiApiKey,
};
const aiEnvVarByProvider: Record<AiProvider, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};
if (!aiKeyByProvider[env.aiProvider]) {
  throw new Error(
    `AI_PROVIDER=${env.aiProvider}, ale brakuje ${aiEnvVarByProvider[env.aiProvider]} w backend/.env.`
  );
}
