/**
 * LCSS — email normalization for auth rate-limit keys.
 *
 * Server-safe pure helper (no dependencies). The normalized value is used
 * ONLY as a rate-limit key — never as an authentication credential — and
 * passwords are never passed through here.
 */
export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

/** True when the value looks like a usable email after normalization. */
export function isUsableEmail(raw: unknown): boolean {
  const normalized = normalizeEmail(raw);
  return normalized.length > 3 && normalized.includes("@");
}
