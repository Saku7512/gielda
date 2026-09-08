import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Nie rzucamy tu błędu przy braku konfiguracji — na poziomie modułu wywaliłoby
// to całą aplikację przed pierwszym renderem (biały ekran / natychmiastowe
// zamknięcie na urządzeniu, bez żadnego czytelnego komunikatu). Brak konfiguracji
// obsługujemy w miejscu wywołania (CandidatesScreen), gdzie da się to pokazać
// jako zwykły stan błędu w UI.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;
