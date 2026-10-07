/**
 * LCSS — server-side authorization helpers for self-managed auth.
 *
 * SERVER-ONLY. Identity always comes from the verified session cookie —
 * never from URL params, request bodies, localStorage, or hidden fields.
 * These mirror the contract of `lib/supabase/access.ts` so the later
 * cutover swaps one import path.
 */
import "server-only";
import { getSessionUser, type PgSession } from "./session";

export class PgAuthError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
  }
}

export type PgAllowedRole = PgSession["role"];

/**
 * Resolve the current user from a raw session token (or null when absent).
 * Returns `null` for missing/expired/invalid sessions.
 */
export async function getCurrentPgUser(
  token: string | null | undefined,
): Promise<PgSession | null> {
  return getSessionUser(token);
}

/** Require any authenticated user; throws 401 otherwise. */
export async function requirePgUser(
  token: string | null | undefined,
): Promise<PgSession> {
  const session = await getCurrentPgUser(token);
  if (!session) {
    throw new PgAuthError(401, "You must be signed in to continue.");
  }
  return session;
}

/** Require the session to hold exactly `role`; 401 when signed out, 403 on mismatch. */
export async function requirePgRole(
  token: string | null | undefined,
  role: PgAllowedRole,
): Promise<PgSession> {
  const session = await requirePgUser(token);
  if (session.role !== role) {
    throw new PgAuthError(403, "You are not authorized to access this area.");
  }
  return session;
}

/** Require the session to hold any of `roles`; 401 when signed out, 403 on mismatch. */
export async function requirePgAnyRole(
  token: string | null | undefined,
  roles: PgAllowedRole[],
): Promise<PgSession> {
  const session = await requirePgUser(token);
  if (!roles.includes(session.role)) {
    throw new PgAuthError(403, "You are not authorized to access this area.");
  }
  return session;
}
