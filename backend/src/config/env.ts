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

  // Watchlisty per rynek — US: bare tickery (np. "AAPL"), PL/EU: ticker.EXCHANGE
  // w formacie EODHD (np. "PKN.WAR", "SAP.XETRA"). WATCHLIST bez sufiksu to
  // wsteczna kompatybilność — traktowana jak WATCHLIST_US, gdy ta jest pusta.
  watchlistUs: parseWatchlist(process.env.WATCHLIST_US ?? process.env.WATCHLIST ?? ""),
  watchlistPl: parseWatchlist(process.env.WATCHLIST_PL ?? ""),
  watchlistEu: parseWatchlist(process.env.WATCHLIST_EU ?? ""),

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

  // Rynki PL/EU (GPW, XETRA, Euronext) — patrz CLAUDE.md. Plan ma bardzo
  // ciasny limit zapytań (~20), więc opcjonalny na tym etapie.
  eodhdApiKey: optionalEnv("EODHD_API_KEY"),
};

if (env.watchlistUs.length === 0 && env.watchlistPl.length === 0 && env.watchlistEu.length === 0) {
  throw new Error(
    "Wszystkie watchlisty (WATCHLIST_US/PL/EU) w backend/.env są puste. Podaj przynajmniej jedną."
  );
}
if ((env.watchlistPl.length > 0 || env.watchlistEu.length > 0) && !env.eodhdApiKey) {
  throw new Error(
    "WATCHLIST_PL/WATCHLIST_EU nie jest puste, ale brakuje EODHD_API_KEY w backend/.env."
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
