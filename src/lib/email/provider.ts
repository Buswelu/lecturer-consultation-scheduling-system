/**
 * LCSS — provider-neutral email interface (server-only).
 *
 * Callers (`src/lib/auth/users.ts`) depend ONLY on this interface: adding a
 * real provider means implementing `EmailProvider` + selecting it via
 * `EMAIL_PROVIDER`, with zero changes to auth flows. Sends are best-effort
 * (failures are logged without tokens and never fail the auth request).
 *
 * Included provider:
 * - `logEmailProvider` (development default): records recipient + type to
 *   server logs. NEVER logs tokens, links, or bodies containing secrets.
 *   Local token inspection stays behind `LCSS_DEV_TOKENS=1` API responses.
 */
import "server-only";

export interface VerificationEmail {
  to: string;
  verifyUrl: string;
}

export interface PasswordResetEmail {
  to: string;
  resetUrl: string;
}

export interface EmailProvider {
  readonly kind: string;
  sendVerificationEmail(input: VerificationEmail): Promise<void>;
  sendPasswordResetEmail(input: PasswordResetEmail): Promise<void>;
}

/** Never log tokens or full URLs (they embed single-use secrets). */
function safeLog(type: string, to: string): void {
  console.info(`[email] provider=log type=${type} to=${to} status=suppressed`);
}

export const logEmailProvider: EmailProvider = {
  kind: "log",
  async sendVerificationEmail(input: VerificationEmail): Promise<void> {
    void input.verifyUrl;
    safeLog("verification", input.to);
  },
  async sendPasswordResetEmail(input: PasswordResetEmail): Promise<void> {
    void input.resetUrl;
    safeLog("password-reset", input.to);
  },
};

export function resolveEmailProvider(kind: string): EmailProvider {
  if (kind === "resend" || kind === "smtp") {
    throw new Error(
      `EMAIL_PROVIDER=${kind} is not configured. See docs/DEPLOYMENT.md for integration steps.`,
    );
  }
  return logEmailProvider;
}
