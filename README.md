# Giełda — AI Stock Advisor

Aplikacja asystenta AI do typowania spółek na max spadkach z potencjałem
odbicia oraz monitorowania pozycji pod kątem sprzedaży.

Pełna specyfikacja projektu (architektura, logika scoringu, stack) — patrz [`CLAUDE.md`](./CLAUDE.md).
Ten plik jest czytany automatycznie przez Claude Code jako kontekst projektu.

## Szybki start

### Backend
1. `cd backend && npm install`
2. Skopiuj `backend/.env.example` do `backend/.env` i uzupełnij klucze API
   (Finnhub, FMP; AI_PROVIDER + klucz dostawcy AI — domyślnie DeepSeek;
   opcjonalnie Supabase).
3. `npm run screener:run` — pobiera dane, liczy score i wypisuje tabelę
   kandydatów w konsoli (zapisuje też do Supabase, jeśli skonfigurowane).

### App (Expo)
1. `cd app && npm install`
2. Skopiuj `app/.env.example` do `app/.env` i uzupełnij `EXPO_PUBLIC_SUPABASE_URL`
   / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (klucz anon, nie service role).
3. `npm run web` (lub `npm start` + Expo Go na telefonie) — ekran kandydatów
   czyta wyniki zapisane przez backend do Supabase.

## Status
🚧 MVP w budowie — warstwy scoringu 1-3 (drawdown, fundamenty, klasyfikacja AI)
i zapis do Supabase gotowe w backendzie; w apce prosty ekran kandydatów.
Portfel, monitoring pozycji i push notifications — kolejny etap.
