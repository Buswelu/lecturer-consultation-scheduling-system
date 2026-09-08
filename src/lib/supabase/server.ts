import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

export type TypedSupabaseServerClient = SupabaseClient<Database>;

function getEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Server-side Supabase client for Server Components / Route Handlers /
 * Server Actions. Reads and writes the auth session via cookies.
 *
 * Returns `null` when Supabase is not configured so server code can fall
 * back to mock data during development.
 */
export async function createClient(): Promise<TypedSupabaseServerClient | null> {
  const env = getEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component (read-only context) — session
          // refresh is then handled by the root proxy instead.
        }
      },
    },
  });
}

/**
 * Privileged service-role client. BYPASSES Row Level Security.
 *
 * Server-only: must never be imported by client components. Used for admin
 * provisioning and system-generated rows (e.g. notifications created by
 * database triggers are unnecessary — those run as the trigger owner).
 *
 * Throws when `SUPABASE_SERVICE_ROLE_KEY` is not set.
 */
export async function createServiceClient(): Promise<TypedSupabaseServerClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set to use the service client.",
    );
  }
  // Service client never needs user cookies, but the @supabase/ssr factory
  // requires cookie handlers — provide inert ones.
  return createServerClient<Database>(url, serviceKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        /* no-op: service role does not maintain a user session */
      },
    },
  });
}
