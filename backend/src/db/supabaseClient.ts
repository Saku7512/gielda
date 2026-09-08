import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";

let client: SupabaseClient | null = null;

/**
 * Klient z uprawnieniami service role — backend zapisuje wyniki screenera
 * z pominięciem RLS. Zwraca null, gdy Supabase nie jest jeszcze skonfigurowane
 * (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY puste), żeby dało się rozwijać
 * i testować resztę pipeline'u bez posiadania projektu Supabase.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) return null;
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  }
  return client;
}
