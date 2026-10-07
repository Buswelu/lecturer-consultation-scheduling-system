/**
 * LCSS — client IP extraction (single reusable utility).
 *
 * Security rules:
 * - Only reads server-side request headers; never trusts client-provided
 *   body fields.
 * - When deployed behind Vercel (or another trusted proxy), the platform
 *   sets `x-forwarded-for` (client first) and `x-real-ip`. We honor exactly
 *   those two headers, in that order — all other headers are ignored.
 * - Returns the literal string "unknown" when no usable IP is present so
 *   callers still get a stable (shared) rate-limit bucket instead of
 *   crashing or skipping enforcement.
 *
 * Keep ALL IP logic here — do not scatter header parsing through the app.
 */

const MAX_IP_LENGTH = 45; // max IPv6 text length

function firstForwarded(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim() ?? "";
  return first.length > 0 ? first : null;
}

function looksLikeIp(value: string): boolean {
  if (value.length === 0 || value.length > MAX_IP_LENGTH) return false;
  // IPv4 dotted quad or IPv6 hex/colons (loose validation on purpose).
  if (/^[0-9a-zA-Z.:]+$/.test(value) === false) return false;
  return value.includes(".") || value.includes(":");
}

/**
 * Extract the client IP from server request headers.
 *
 * Accepts either a `Headers` instance (NextRequest / web Request) or a
 * plain header record (tests / node `req.headers`).
 */
export function getClientIp(
  headers: Headers | Record<string, string | string[] | null | undefined>,
): string {
  const read = (name: string): string | null => {
    if (typeof (headers as Headers).get === "function") {
      return (headers as Headers).get(name);
    }
    const record = headers as Record<string, unknown>;
    const direct = record[name] ?? record[name.toLowerCase()];
    if (Array.isArray(direct)) return direct[0] ?? null;
    if (typeof direct === "string") return direct;
    return null;
  };

  const forwarded = firstForwarded(read("x-forwarded-for"));
  if (forwarded && looksLikeIp(forwarded)) return forwarded;

  const realIp = read("x-real-ip")?.trim() ?? "";
  if (realIp && looksLikeIp(realIp)) return realIp;

  return "unknown";
}
