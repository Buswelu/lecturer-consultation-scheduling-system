/**
 * LCSS — server-side auth event logging.
 *
 * Logs security-relevant events WITHOUT passwords, tokens, or service keys,
 * and without full PII: emails are reduced to a non-reversible hash and IPs
 * to a hash as well (the raw IP stays in the rate-limit key only).
 */

export type AuthLogEvent =
  | "login_failure"
  | "login_rate_limited"
  | "login_success"
  | "recovery_rate_limited"
  | "recovery_requested"
  | "register_rate_limited"
  | "register_attempt";

/** FNV-1a 32-bit hash — dependency-free, non-reversible redaction. */
export function hashIdentifier(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface AuthLogContext {
  emailHash?: string;
  ipHash?: string;
}

export function authLogContextFor(
  normalizedEmail: string | null,
  ip: string | null,
): AuthLogContext {
  const ctx: AuthLogContext = {};
  if (normalizedEmail) ctx.emailHash = hashIdentifier(normalizedEmail);
  if (ip) ctx.ipHash = hashIdentifier(ip);
  return ctx;
}

export function logAuthEvent(
  event: AuthLogEvent,
  ctx: AuthLogContext = {},
): void {
  const payload = JSON.stringify({ event, ...ctx });
  if (
    event === "login_rate_limited" ||
    event === "recovery_rate_limited" ||
    event === "register_rate_limited" ||
    event === "login_failure"
  ) {
    console.warn(`[auth] ${payload}`);
  } else {
    console.info(`[auth] ${payload}`);
  }
}
