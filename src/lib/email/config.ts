/**
 * LCSS — email configuration (server-only).
 *
 * No provider is bundled: `EMAIL_PROVIDER` selects `log` (development,
 * default) today; production integrators add a real provider implementing
 * `EmailProvider` (see `provider.ts` + `docs/DEPLOYMENT.md`) without
 * touching callers. APP_URL is validated (http/https, no credentials)
 * because reset/verify links are built from it.
 */
import "server-only";

export type EmailProviderKind = "log" | "resend" | "smtp";

/** Validated public base URL (trailing slash stripped). */
export function validatedAppUrl(): string {
  const raw = (process.env.APP_URL ?? "http://localhost:3000").trim().replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("APP_URL must be a valid http(s) URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("APP_URL must be a valid http(s) URL.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("APP_URL must not contain credentials.");
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("APP_URL must use https in production.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function emailProviderKind(): EmailProviderKind {
  const raw = (process.env.EMAIL_PROVIDER ?? "log").trim().toLowerCase();
  if (raw === "resend" || raw === "smtp") return raw;
  return "log";
}

export function passwordResetUrl(token: string): string {
  return `${validatedAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export function verificationUrl(token: string): string {
  return `${validatedAppUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}
