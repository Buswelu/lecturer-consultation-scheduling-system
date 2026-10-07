/**
 * LCSS — server-side sessions for self-managed auth (server-only).
 *
 * Opaque tokens: the cookie holds a random 256-bit hex token; PostgreSQL
 * stores HMAC-SHA256(token, SESSION_SECRET) + expiry. Stealing the database
 * alone yields no usable session. Sliding expiry refreshes `expires_at` /
 * `last_seen_at` while the session is actively used.
 */
import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { getPool } from "@/lib/db/pool";
import { queryOne } from "@/lib/db/query";
import { SESSION_COOKIE_NAME, sessionSecret, sessionTtlSeconds } from "./config";

export interface PgSession {
  userId: string;
  email: string;
  username: string;
  role: "student" | "lecturer" | "admin";
  fullName: string;
}

interface SessionRow {
  user_id: string;
  email: string;
  username: string;
  role: "student" | "lecturer" | "admin";
  full_name: string;
  expires_at: string;
  last_seen_at: string;
}

/** Hash a raw token for storage/comparison (never store the raw token). */
export function hashSessionToken(token: string): string {
  return createHmac("sha256", sessionSecret()).update(token, "utf8").digest("hex");
}

/** Create a session row and return the raw cookie token + expiry. */
export async function createSession(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const ttlMs = sessionTtlSeconds() * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  await getPool().query(
    "insert into public.sessions (user_id, token_hash, expires_at) values ($1, $2, $3)",
    [userId, hashSessionToken(token), expiresAt.toISOString()],
  );
  return { token, expiresAt };
}

/**
 * Validate a raw cookie token and return the session identity, or `null`
 * for missing/unknown/expired/inactive sessions. Refreshes sliding expiry
 * when the session is past half its TTL.
 */
export async function getSessionUser(token: string | null | undefined): Promise<PgSession | null> {
  if (!token) return null;
  const row = await queryOne<SessionRow>(
    `select s.user_id, u.email, u.username, p.role, p.full_name, s.expires_at, s.last_seen_at
       from public.sessions s
       join public.users u on u.id = s.user_id
       join public.profiles p on p.id = u.id
      where s.token_hash = $1
        and u.is_active`,
    [hashSessionToken(token)],
  );
  if (!row) return null;
  const now = Date.now();
  if (Date.parse(row.expires_at) <= now) return null;
  // Sliding refresh: extend while actively used (past half the TTL).
  const ttlMs = sessionTtlSeconds() * 1000;
  if (Date.parse(row.last_seen_at) + ttlMs / 2 <= now) {
    const expiresAt = new Date(now + ttlMs).toISOString();
    await getPool()
      .query(
        "update public.sessions set expires_at = $2, last_seen_at = now() where token_hash = $1",
        [hashSessionToken(token), expiresAt],
      )
      .catch(() => undefined);
  }
  return {
    userId: row.user_id,
    email: row.email,
    username: row.username,
    role: row.role,
    fullName: row.full_name,
  };
}

/** Invalidate one session. Safe to call for already-gone tokens. */
export async function destroySession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await getPool()
    .query("delete from public.sessions where token_hash = $1", [hashSessionToken(token)])
    .catch(() => undefined);
}

/** Invalidate every session of a user (password change, admin lockout). */
export async function destroyAllUserSessions(userId: string): Promise<void> {
  await getPool().query("delete from public.sessions where user_id = $1", [userId]);
}

/** Extract the raw session token from a Cookie header value. */
export function sessionTokenFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE_NAME) {
      const value = part.slice(idx + 1).trim();
      return value.length > 0 ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

export interface SessionCookie {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    path: "/";
    maxAge: number;
    secure: boolean;
  };
}

/** Cookie attributes for a fresh session (routes apply via NextResponse). */
export function buildSessionCookie(token: string): SessionCookie {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: sessionTtlSeconds(),
      // Local dev runs over plain HTTP; production must be HTTPS.
      secure: process.env.NODE_ENV === "production",
    },
  };
}

/** Expired cookie used to clear the browser session on logout. */
export function buildClearedSessionCookie(): Omit<SessionCookie, "options"> & {
  options: { httpOnly: true; sameSite: "lax"; path: "/"; maxAge: 0 };
} {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    options: { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 },
  };
}
