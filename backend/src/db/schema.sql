-- Wyniki screenera (Warstwy 1+2+3) — insert-only, żeby zachować historię per
-- spółka. Ekran kandydatów w apce czyta najnowszy wiersz na symbol (patrz
-- widok screener_latest_results poniżej); historia jest potrzebna później do
-- monitoringu pozycji (Warstwa "fundamental stop-loss" z CLAUDE.md).
create table if not exists screener_results (
  id bigint generated always as identity primary key,
  symbol text not null,
  company_name text not null,
  sector text not null,
  current_price numeric not null,
  benchmark_symbol text not null,
  beta numeric not null,
  excess_drawdown numeric not null,
  excess_drawdown_score numeric not null,
  rsi14 numeric not null,
  fundamental_health_score numeric not null,
  fundamental_checks jsonb not null,
  ai_provider text,
  ai_cause text,
  ai_confidence numeric,
  ai_reasoning text,
  composite_score_partial numeric not null,
  composite_score numeric,
  scored_at timestamptz not null default now()
);

create index if not exists screener_results_symbol_scored_at_idx
  on screener_results (symbol, scored_at desc);

-- Najnowszy wynik per symbol — to z tego korzysta CandidatesScreen w apce.
create or replace view screener_latest_results as
select distinct on (symbol) *
from screener_results
order by symbol, scored_at desc;

alter table screener_results enable row level security;

-- MVP: apka czyta anonimowo (bez logowania użytkownika na tym etapie).
-- Zapis robi wyłącznie backend przez service role key, który omija RLS,
-- więc nie potrzeba tu osobnej polityki na insert.
create policy "screener_results_public_read"
  on screener_results for select
  to anon, authenticated
  using (true);
