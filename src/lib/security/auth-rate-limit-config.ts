/**
 * LCSS — auth rate-limit configuration (env-driven, no code changes needed).
 *
 * Defaults (per product requirement):
 *   login:    5 failures / 300s window / 900s lockout
 *   recovery: 3 attempts / 3600s window / 3600s lockout (lockout = window)
 *   register: 5 attempts / 3600s window / 3600s lockout (lockout = window)
 *
 * Every value is overridable via environment variables so normal students /
 * lecturers are not easily locked out and ops can tune without redeploying
 * source. Non-numeric / non-positive values fall back to the defaults.
 */

export interface RateLimitPolicy {
  maxAttempts: number;
  windowSeconds: number;
  lockoutSeconds: number;
}

function readPositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export const AUTH_LOGIN_POLICY_DEFAULT: RateLimitPolicy = {
  maxAttempts: 5,
  windowSeconds: 300,
  lockoutSeconds: 900,
};

export const AUTH_RECOVERY_POLICY_DEFAULT: RateLimitPolicy = {
  maxAttempts: 3,
  windowSeconds: 3600,
  lockoutSeconds: 3600,
};

export const AUTH_REGISTER_POLICY_DEFAULT: RateLimitPolicy = {
  maxAttempts: 5,
  windowSeconds: 3600,
  lockoutSeconds: 3600,
};

export interface AuthRateLimitConfig {
  login: RateLimitPolicy;
  recovery: RateLimitPolicy;
  register: RateLimitPolicy;
}

function readConfig(env: NodeJS.ProcessEnv = process.env): AuthRateLimitConfig {
  return {
    login: {
      maxAttempts: readPositiveInt(
        env.AUTH_LOGIN_MAX_ATTEMPTS,
        AUTH_LOGIN_POLICY_DEFAULT.maxAttempts,
      ),
      windowSeconds: readPositiveInt(
        env.AUTH_LOGIN_WINDOW_SECONDS,
        AUTH_LOGIN_POLICY_DEFAULT.windowSeconds,
      ),
      lockoutSeconds: readPositiveInt(
        env.AUTH_LOGIN_LOCKOUT_SECONDS,
        AUTH_LOGIN_POLICY_DEFAULT.lockoutSeconds,
      ),
    },
    recovery: {
      maxAttempts: readPositiveInt(
        env.AUTH_RECOVERY_MAX_ATTEMPTS,
        AUTH_RECOVERY_POLICY_DEFAULT.maxAttempts,
      ),
      windowSeconds: readPositiveInt(
        env.AUTH_RECOVERY_WINDOW_SECONDS,
        AUTH_RECOVERY_POLICY_DEFAULT.windowSeconds,
      ),
      lockoutSeconds: readPositiveInt(
        env.AUTH_RECOVERY_LOCKOUT_SECONDS,
        AUTH_RECOVERY_POLICY_DEFAULT.lockoutSeconds,
      ),
    },
    register: {
      maxAttempts: readPositiveInt(
        env.AUTH_REGISTER_MAX_ATTEMPTS,
        AUTH_REGISTER_POLICY_DEFAULT.maxAttempts,
      ),
      windowSeconds: readPositiveInt(
        env.AUTH_REGISTER_WINDOW_SECONDS,
        AUTH_REGISTER_POLICY_DEFAULT.windowSeconds,
      ),
      lockoutSeconds: readPositiveInt(
        env.AUTH_REGISTER_LOCKOUT_SECONDS,
        AUTH_REGISTER_POLICY_DEFAULT.lockoutSeconds,
      ),
    },
  };
}

/** Resolved config (read once per server process; tests may call readConfig). */
export const authRateLimitConfig: AuthRateLimitConfig = readConfig();

export { readConfig };
