import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type TypedSupabaseClient = SupabaseClient<Database>;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let client: TypedSupabaseClient | null = null;

/** True when Supabase env vars are configured (i.e. live backend available). */
export function isSupabaseConfigured(): boolean {
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
}

/**
 * Browser-side Supabase client (singleton).
 *
 * Returns `null` when Supabase is not configured so the UI can keep running
 * on the mock data layer. Callers in `src/lib/services/*` check for `null`
 * and fall back to mock data.
 */
export function getSupabase(): TypedSupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!client) {
    client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  }
  return client;
}
