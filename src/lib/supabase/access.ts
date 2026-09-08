/**
 * LCSS — server-side access helpers (Phase 2: preparation layer).
 *
 * SERVER-ONLY (enforced via the `server-only` package): resolves the
 * authenticated user + trusted role from the database for future route
 * protection of `/student/*`, `/lecturer/*`, `/admin/*`.
 *
 * Usage (authentication phase):
 *
 *   import { requireServerRole } from "@/lib/supabase/access";
 *   const session = await requireServerRole(["admin"]);
 *   if (!session) redirect("/login");
 */
import "server-only";
import { createClient } from "./server";
import type { DbRole, Tables } from "./database.types";

export interface ServerSession {
  userId: string;
  email: string | null;
  role: DbRole;
  profile: Tables<"profiles">;
}

/**
 * Resolve the current server session (user + trusted DB role).
 * Returns `null` when Supabase is unconfigured, signed out, or the profile
 * row is missing.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .single();
  if (!profile) return null;
  return {
    userId: auth.user.id,
    email: auth.user.email ?? null,
    role: profile.role,
    profile,
  };
}

/**
 * Resolve the session and require one of `allowed` roles.
 * Returns the session, or `null` when access must be denied (caller
 * redirects, e.g. to `/login` or `/`).
 */
export async function requireServerRole(
  allowed: DbRole[],
): Promise<ServerSession | null> {
  const session = await getServerSession();
  if (!session) return null;
  if (!allowed.includes(session.role)) return null;
  return session;
}
