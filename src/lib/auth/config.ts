/**
 * LCSS — self-managed auth configuration (server-only).
 *
 * Centralizes every tunable of the PostgreSQL auth system. All values are
 * server-side; nothing here may reach the browser.
 */
import "server-only";

export const SESSION_COOKIE_NAME = "lcss_session";

/** Session lifetime in seconds (default 7 days). */export function sessionTtlSeconds(): number {
  const raw = process.env.SESSION_TTL_SECONDS;
  const parsed = raw ? Number.parseInt(raw.trim(), 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 604800;
}

/**
 * Secret binding session/reset/verification token hashes.
 * Required whenever a token is created or checked — fail fast when missing
 * so a misconfigured server never issues unbound tokens.
 */
export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a random string of at least 32 characters.",
    );
  }
  return secret;
}

/** Public base URL for auth links (server-side use only, never NEXT_PUBLIC). */
export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Whether single-use tokens (email verification / password reset) may be
 * returned in API JSON for local manual testing. Only when explicitly
 * enabled AND not in production — never in production.
 */
export function devTokensExposed(): boolean {
  return (
    process.env.NODE_ENV !== "production" && process.env.LCSS_DEV_TOKENS === "1"
  );
}

/** Email-verification token lifetime: 24h. Password-reset: 1h. */
export const EMAIL_VERIFICATION_TTL_SECONDS = 24 * 3600;
export const PASSWORD_RESET_TTL_SECONDS = 3600;
