# AI Stock Advisor — specyfikacja projektu

## Cel aplikacji
Aplikacja mobilna (Expo/React Native) z asystentem AI, który:
1. Typuje spółki do zakupu — szuka mocnych spadków ceny, których nie uzasadnia
   kondycja finansowa spółki (okazje kontrariańskie z potencjałem odbicia).
2. Monitoruje posiadane pozycje 24/7 i generuje alerty sprzedaży.
3. Uzasadnia każdą rekomendację w języku naturalnym, uwzględniając kontekst
   newsowy i geopolityczny.

Nie jest to bot handlujący automatycznie — to narzędzie decyzyjne. Finalną
decyzję zawsze podejmuje użytkownik.

## Stack techniczny
- **Backend**: Node.js + TypeScript, hostowany na Railway lub Render (darmowy tier na start)
- **Baza danych**: Supabase (Postgres + realtime + auth) — darmowy tier
- **Mobile**: Expo (React Native) + Expo Notifications do alertów push
- **AI**: dostawca wybieralny przez `AI_PROVIDER` w `.env` (`deepseek` | `anthropic` | `gemini`)
  do klasyfikacji przyczyn spadków i generowania uzasadnień. Start: DeepSeek (koszt), z możliwością
  przełączenia na Claude lub Gemini bez zmian w kodzie scoringu — patrz `backend/src/integrations/ai/`.
- **Repo**: monorepo z folderami `/backend` i `/app`

## Źródła danych
| Cel | Provider | Tier startowy |
|---|---|---|
| Ceny, wolumen, news sentiment | Finnhub | Free: 60 req/min |
| Fundamenty (sprawozdania, wskaźniki, DCF) | Financial Modeling Prep (FMP) | Free: 250 req/dzień, potem $22/mc |
| Wskaźniki techniczne (backup) | Twelve Data | Free: 800 req/dzień |
| Geopolityka / makro newsy | RSS z Reuters/Bloomberg + interpretacja przez model AI (patrz `AI_PROVIDER`) | — |

Klucze API w `.env` — patrz `backend/.env.example`.

## Logika scoringu (3 warstwy)

### Warstwa 1 — Siła spadku
- `excess_drawdown` = spadek spółki (52w high i 90d high) minus spadek sektora/benchmarku w tym samym okresie (beta-adjusted)
- RSI < 30 i cena poniżej -2 odchylenia std. od SMA50/SMA200 podnoszą wynik

### Warstwa 2 — Zdrowie fundamentalne (zmodyfikowany Piotroski F-Score)
- Rentowność: ROA > 0, operacyjny cash flow > 0, cash flow > zysk netto (jakość zysków)
- Zadłużenie: Debt/EBITDA w normie branżowej, interest coverage > 3x, current ratio > 1
- Trend: przychody/marże stabilne lub rosnące w ostatnich 4 kwartałach
- Wycena: P/E i EV/EBITDA poniżej własnej 5-letniej średniej i poniżej peer group

### Warstwa 3 — Klasyfikacja przyczyny (AI)
Na podstawie ostatnich newsów o spółce model AI (dostawca wg `AI_PROVIDER`) klasyfikuje przyczynę
spadku do jednej z kategorii:
- `market_overreaction` (panika sektorowa/ogólny sentyment, jednorazowy negatywny nagłówek bez wpływu na fundamenty) → wysoka waga pozytywna
- `fundamental_deterioration` (obniżka prognoz, utrata kontraktu, problem z długiem) → odrzucić mimo niskiej ceny
- `structural_geopolitical_risk` (trwałe sankcje, cła, zmiana regulacji) → odrzucić lub mocno obniżyć wagę

Prompt do klasyfikacji musi zwracać strukturalny JSON: `{ cause: string, confidence: number, reasoning: string }`.

### Composite score
```
score = 0.35 * excess_drawdown_normalized
      + 0.40 * fundamental_health_normalized
      + 0.25 * ai_cause_weight
```
Próg wejścia na listę kandydatów: `score > 70` (skala 0–100).

## Logika sprzedaży / monitoringu
Trigger na pogorszenie fundamentów jest ważniejszy niż sam ruch ceny:
- **Take-profit**: cena wraca do mediany historycznego P/E (5 lat) lub +X% od zakupu (konfigurowalne per pozycja)
- **Fundamental stop-loss**: jeśli `fundamental_health` spadnie poniżej progu (np. kolejny słaby kwartał) → alert „sprzedaj" niezależnie od ceny
- **Trailing stop** po odbiciu, żeby nie oddać całego zysku

## Architektura backendu
- Cron job (node-cron) odpala screener cyklicznie (`SCREENER_CRON` w .env) — częstotliwość ograniczona limitami darmowych API, nie prawdziwy real-time
- Wyniki i uzasadnienia zapisywane do Supabase
- Supabase realtime subscriptions pushują zmiany do aplikacji mobilnej
- Osobny job monitorujący pozycje z portfela użytkownika, sprawdzający triggery sprzedaży

## Struktura repo (do zbudowania)
```
/backend
  /src
    /integrations   - klienci API (finnhub.ts, fmp.ts, eodhd.ts, ai/)
    /scoring         - drawdown.ts, fundamentals.ts, aiClassifier.ts, compositeScore.ts, sectorRanking.ts
    /screener        - runScreener.ts (główny pipeline)
    /jobs            - cron.ts, portfolioMonitor.ts
    /db              - schema.sql, klient supabase
  .env.example
/app
  /src
    /screens         - CandidatesScreen, PortfolioScreen, CompanyDetailScreen
    /services        - api.ts (komunikacja z backendem/Supabase)
```

## MVP — zakres pierwszej iteracji
1. Backend: integracja z Finnhub + FMP, implementacja warstw 1 i 2 scoringu (bez AI na start, żeby zweryfikować dane)
2. Dodanie warstwy 3 (klasyfikacja AI) po potwierdzeniu, że dane wejściowe są poprawne
3. Zapis wyników do Supabase + prosty ekran w Expo wyświetlający listę kandydatów
4. Portfel użytkownika + monitoring pozycji + push notifications
5. Pełna automatyzacja 24/7 (cron + alerty)

## Rozszerzenie: rynki PL/EU (dodane po MVP US) — zaimplementowane

### Model danych — nowe pola (screener_results)
- `market`: "PL" | "EU" | "US"
- `exchange`: "US" dla rynku US, albo kod EODHD dla PL/EU: "WAR" (GPW), "XETRA", "PA" (Euronext Paris), "AS" (Euronext Amsterdam)
- `symbol`: dla PL/EU trzymany W CAŁOŚCI z sufiksem giełdy (np. "PKN.WAR", nie samo "PKN") —
  odstępstwo od pierwotnego planu: EODHD i tak wymaga pełnego "SYMBOL.EXCHANGE" przy każdym
  wywołaniu, a watchlisty w .env już są w tym formacie, więc trzymanie surowego kodu bez sufiksu
  tylko dodawałoby zbędne parsowanie w tę i z powrotem.

### Źródła danych per rynek
- US: Finnhub + FMP (bez zmian)
- PL / EU: EODHD — `/backend/src/integrations/eodhd.ts`
- Watchlisty per rynek w .env: `WATCHLIST_US`, `WATCHLIST_PL`, `WATCHLIST_EU` (PL/EU w formacie `TICKER.EXCHANGE`)

### Zweryfikowane empirycznie ograniczenia (2026-09-08, plan EODHD z limitem ~20 zapytań/dzień)
- `GET /eod/{SYMBOL}.{EXCHANGE}` działa (dzienne OHLCV) — na tym opiera się Warstwa 1 dla PL/EU
- `GET /fundamentals/{SYMBOL}.{EXCHANGE}` zwraca `403 Only EOD data allowed for free users` —
  **Warstwa 2 (fundamenty) jest niedostępna dla PL/EU** na tym planie. `fundamental_health_score`
  jest wtedy `null`, a `composite_score_max` spada ze 100 do 60 (brakuje wagi 0.40) — to
  zamierzone zachowanie, nie błąd; patrz `scoring/compositeScore.ts`
- Brak zweryfikowanego symbolu indeksu benchmarkowego (np. WIG20) w EODHD — `excess_drawdown` dla
  PL/EU to surowy drawdown bez beta-adjustmentu względem benchmarku (beta=1, benchmark=null).
  Nie zgadywano symbolu indeksu; do zweryfikowania później, jeśli plan na to pozwoli
- Sektor (`sector`) jest `null` dla PL/EU — `exchange-symbol-list` (jedyny darmowy endpoint z
  metadanymi spółki) nie zwraca sektora, tylko fundamenty by go dały. Spółki bez sektora są
  pomijane w rankingu branż (Warstwa 0)
- Finnhub `/company-news` nie pokrywa GPW (zweryfikowane: 403/puste dane) — Warstwa 3 dla PL/EU
  klasyfikuje bez kontekstu newsowego (ten sam fallback co przy braku klucza Finnhub)

### UI
Filtr rynku w CandidatesScreen (chipy: Polska / Europa / USA / Wszystkie) + karta rankingu branż
na górze (patrz Warstwa 0), klikalna do filtrowania listy po sektorze.

## Warstwa 0 — ranking branż (dodane po MVP)
Osobny moduł `/backend/src/scoring/sectorRanking.ts`, uruchamiany na końcu każdego cyklu screenera
(na razie ręcznie/na żądanie razem z `runScreener.ts` — **bez osobnego crona**, bo cron w ogóle
nie jest jeszcze zbudowany, patrz MVP krok 5; dodanie osobnego joba przed tym byłoby przedwczesne)
- Agreguje z bieżącego cyklu: średni `excess_drawdown_score` i średni `fundamental_health_score`
  per sektor (spółki bez sektora — PL/EU — są pomijane, patrz wyżej)
- **Bez newsów makro/geopolitycznych** — RSS z sekcji "Źródła danych" nie jest zaimplementowane,
  więc model AI rankuje wyłącznie na podstawie zagregowanych liczb z bieżącego cyklu, nie
  bieżących wydarzeń. To udokumentowane uproszczenie, nie pominięcie przez przeoczenie
- Model AI (ten sam dostawca co Warstwa 3) zwraca JSON: `[{ sector, rank, score, reasoning }]`
- Zapis do Supabase: tabela `sector_rankings` (insert-only, jak `screener_results`), widok
  `sector_rankings_latest` dla apki

## Uwagi dla Claude Code
- Zacznij od `/backend`, warstwa po warstwie zgodnie z sekcją MVP powyżej — nie buduj wszystkiego naraz
- Waliduj dane z darmowych API pod kątem limitów zapytań (rate limiting, caching wyników)
- Wszystkie klucze API czytać z `.env`, nigdie nie hardkodować
- Kod w TypeScript, strict mode włączony
