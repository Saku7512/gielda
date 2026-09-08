-- UWAGA: przebudowa schematu po refaktorze na architekturę pluggable strategii
-- (kolumny strategy/trigger_detail, usunięte pola specyficzne tylko dla
-- Strategii A jak beta/benchmark_symbol/rsi14/ai_cause — patrz
-- screener/strategies/). Usuwa istniejące dane w screener_results — to
-- tylko dane testowe z tej sesji, nie dane użytkownika.

drop view if exists screener_latest_results;
drop table if exists screener_results;

-- Wyniki screenera — insert-only, żeby zachować historię per (symbol, strategy).
-- Ekran kandydatów w apce czyta najnowszy wiersz na (symbol, strategy) — patrz
-- widok screener_latest_results poniżej; historia jest potrzebna później do
-- monitoringu pozycji (Warstwa "fundamental stop-loss" z CLAUDE.md).
create table screener_results (
  id bigint generated always as identity primary key,
  symbol text not null,
  market text not null,                    -- 'US' | 'PL' | 'EU'
  exchange text not null,                  -- 'US' albo kod EODHD np. 'WAR', 'XETRA', 'PA', 'AS'
  strategy text not null,                  -- 'overreacted_drawdown' | 'earnings_beat_drop' | 'insider_accumulation'
  trigger_detail text not null,            -- krótki opis co spowodowało trigger danej strategii
  company_name text not null,
  sector text,                             -- null gdy nieznany (PL/EU bez dostępu do fundamentów)
  current_price numeric not null,
  excess_drawdown numeric,                 -- znaczenie zależne od strategii, patrz strategies/*.ts
  excess_drawdown_score numeric,
  fundamental_available boolean not null,  -- false gdy strategia nie liczy fundamentów (PL/EU, Strategia B/C)
  fundamental_health_score numeric,        -- null gdy fundamental_available = false
  ai_reasoning text,
  ai_confidence numeric,
  composite_score numeric not null,        -- suma dostępnych warstw, semantyka per strategia
  composite_score_max numeric not null,    -- maksimum możliwe przy dostępnych warstwach
  scored_at timestamptz not null default now()
);

create index screener_results_symbol_strategy_scored_at_idx
  on screener_results (symbol, strategy, scored_at desc);
create index screener_results_market_idx on screener_results (market);
create index screener_results_strategy_idx on screener_results (strategy);

-- Najnowszy wynik per (symbol, strategy) — jedna spółka może być kandydatem
-- z kilku strategii naraz, to osobne wiersze w apce.
create or replace view screener_latest_results as
select distinct on (symbol, strategy) *
from screener_results
order by symbol, strategy, scored_at desc;

alter table screener_results enable row level security;

-- MVP: apka czyta anonimowo (bez logowania użytkownika na tym etapie).
-- Zapis robi wyłącznie backend przez service role key, który omija RLS,
-- więc nie potrzeba tu osobnej polityki na insert.
create policy "screener_results_public_read"
  on screener_results for select
  to anon, authenticated
  using (true);

-- Warstwa 0 — ranking branż (patrz scoring/sectorRanking.ts). Insert-only,
-- jak wyżej; ekran w apce czyta najnowszy ranking per sektor.
drop view if exists sector_rankings_latest;
drop table if exists sector_rankings;

create table sector_rankings (
  id bigint generated always as identity primary key,
  sector text not null,
  rank integer not null,
  score numeric not null,
  reasoning text not null,
  ai_provider text,
  computed_at timestamptz not null default now()
);

create index sector_rankings_computed_at_idx on sector_rankings (computed_at desc);

create or replace view sector_rankings_latest as
select distinct on (sector) *
from sector_rankings
order by sector, computed_at desc;

alter table sector_rankings enable row level security;

create policy "sector_rankings_public_read"
  on sector_rankings for select
  to anon, authenticated
  using (true);
