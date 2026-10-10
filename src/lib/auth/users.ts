/**
 * LCSS — self-managed user services (server-only).
 *
 * Registration / login / password-reset / email-verification against the
 * `users` table. Every query is parameterized; registration is one
 * transaction (user + profile + student/lecturer + verification token) so a
 * failure never leaves orphan rows. Errors are generic by design — responses
 * never reveal whether an email is registered.
 */
import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { queryOne } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { normalizeEmail } from "@/lib/security/normalize-email";
import { authRateLimitConfig } from "@/lib/security/auth-rate-limit-config";
import { authLogContextFor, logAuthEvent } from "@/lib/security/auth-log";
import {
  emailProviderKind,
  passwordResetUrl,
  verificationUrl,
} from "@/lib/email/config";
import { resolveEmailProvider } from "@/lib/email/provider";
import {
  EMAIL_VERIFICATION_TTL_SECONDS,
  PASSWORD_RESET_TTL_SECONDS,
  devTokensExposed,
  sessionSecret,
} from "./config";
import {
  categoryForPublicRole,
  formatIdentifier,
  isEmailLike,
  normalizeIdentifier,
  parseIdentifier,
  sequenceForCategory,
} from "./identifiers";
import { hashPassword, verifyPassword } from "./password";
import {
  checkPgRateLimit,
  recordPgFailure,
  recordPgSuccess,
  resetPgKey,
} from "./rate-limit-pg";
import { createSession } from "./session";

// ---------------------------------------------------------------------------
// Validation (mirrors the preserved UI constraints: password ≥ 6, name ≥ 3)
// ---------------------------------------------------------------------------

export const pgRegisterSchema = z.object({
  email: z.string().email("Please enter a valid email address").max(320),
  password: z.string().min(6, "Password must be at least 6 characters").max(256),
  fullName: z.string().trim().min(3, "Please enter your full name").max(200),
  role: z.enum(["student", "lecturer"]),
});

export const pgLoginSchema = z.object({
  username: z.string().trim().min(3).max(320),
  password: z.string().min(6).max(256),
});

/** Legacy shapes (Stage 3/4): `{ username }` / `{ email }` map onto identifier login. */
export function coerceLoginInput(input: {
  identifier?: unknown;
  username?: unknown;
  email?: unknown;
  password?: unknown;
}): { username: string; password: string } {
  const raw =
    typeof input.identifier === "string" && input.identifier.trim()
      ? input.identifier
      : typeof input.username === "string" && input.username.trim()
        ? input.username
        : typeof input.email === "string"
          ? input.email
          : "";
  return {
    username: raw,
    password: typeof input.password === "string" ? input.password : "",
  };
}

export const pgPasswordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters")
  .max(256);

export type PgRole = "student" | "lecturer" | "admin";
export type PgPublicRole = "student" | "lecturer";

/** Public signup may only request student/lecturer — "admin" falls back. */
export function sanitizePgPublicRole(role: unknown): PgPublicRole {
  return role === "lecturer" ? "lecturer" : "student";
}

export const GENERIC_PG_LOGIN_ERROR = "Invalid username or password.";
export const GENERIC_PG_AUTH_ERROR = GENERIC_PG_LOGIN_ERROR;
export const GENERIC_PG_REGISTER_ERROR = "Unable to create your account. Please try again.";
export const GENERIC_PG_RECOVERY_SUCCESS =
  "If an account exists for this email, you will receive a link shortly.";
export const INVALID_TOKEN_MESSAGE = "This link is invalid or has expired.";

function tokenHash(token: string): string {
  return createHmac("sha256", sessionSecret()).update(token, "utf8").digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

export interface PgSafeUser {
  id: string;
  email: string;
  username: string;
  role: PgRole;
  fullName: string;
}

interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  is_active: boolean;
  email_verified_at: string | null;
}

interface ProfileRow {
  role: PgRole;
  full_name: string;
}

/** Dummy hash so unknown-email logins cost ~the same time (anti-enumeration). */
let dummyHash: string | null = null;
async function dummyHashValue(): Promise<string> {
  if (!dummyHash) dummyHash = await hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export interface RegisterPgInput {
  email: string;
  password: string;
  fullName: string;
  role: unknown;
  ip: string;
}

export async function registerPgUser(input: RegisterPgInput): Promise<{
  user: PgSafeUser;
  needsVerification: boolean;
  devToken?: string;
}> {
  const parsed = pgRegisterSchema.safeParse({
    email: input.email,
    password: input.password,
    fullName: input.fullName,
    role: sanitizePgPublicRole(input.role),
  });
  if (!parsed.success) {
    throw new Error("Please check your details and try again.");
  }
  const email = normalizeEmail(parsed.data.email);
  const policy = authRateLimitConfig.register;
  const registerCtx = authLogContextFor(email, input.ip);
  const ipCheck = await checkPgRateLimit(`register:ip:${input.ip}`, policy);
  if (!ipCheck.allowed) {
    logAuthEvent("register_rate_limited", registerCtx);
    const err = new Error("Too many requests. Please try again later.") as Error & {
      status?: number;
      retryAfterSeconds?: number | null;
    };
    err.status = 429;
    err.retryAfterSeconds = ipCheck.retryAfterSeconds;
    throw err;
  }

  const existing = await queryOne<{ id: string }>(
    "select id from public.users where email = $1",
    [email],
  );
  await recordPgFailure(`register:ip:${input.ip}`, policy);
  if (existing) {
    // Generic — never confirm whether the address is already registered.
    throw new Error(GENERIC_PG_REGISTER_ERROR);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const role = parsed.data.role;
  logAuthEvent("register_attempt", registerCtx);
  // The identifier is system-generated (never user-chosen, never squattable).
  const category = categoryForPublicRole(role);
  const verificationToken = newToken();
  const result = await withTransaction(async (tx) => {
    const seqRes = await tx.query<{ nextval: string }>(
      `select nextval('${sequenceForCategory(category)}') as nextval`,
    );
    const username = formatIdentifier(
      category,
      new Date().getFullYear(),
      Number.parseInt(seqRes.rows[0].nextval, 10),
    );
    const userRes = await tx.query<{ id: string }>(
      `insert into public.users (email, username, password_hash) values ($1, $2, $3) returning id`,
      [email, username, passwordHash],
    );
    const userId = userRes.rows[0].id;
    await tx.query(
      `insert into public.profiles (id, full_name, email, role) values ($1, $2, $3, $4)`,
      [userId, parsed.data.fullName.trim(), email, role],
    );
    if (role === "lecturer") {
      await tx.query(
        `insert into public.lecturers (profile_id, staff_number) values ($1, $2)`,
        [userId, username],
      );
    } else {
      await tx.query(
        `insert into public.students (profile_id, student_number) values ($1, $2)`,
        [userId, username],
      );
    }
    await tx.query(
      `insert into public.email_verifications (user_id, token_hash, expires_at)
       values ($1, $2, now() + make_interval(secs => $3))`,
      [
        userId,
        tokenHash(verificationToken),
        EMAIL_VERIFICATION_TTL_SECONDS,
      ],
    );
    return { userId, username };
  });

  // Best-effort verification dispatch (never fails registration, never logs
  // the token — local inspection stays behind LCSS_DEV_TOKENS responses).
  try {
    await resolveEmailProvider(emailProviderKind()).sendVerificationEmail({
      to: email,
      verifyUrl: verificationUrl(verificationToken),
    });
  } catch {
    // Email delivery is auxiliary; registration already succeeded.
  }

  return {
    user: {
      id: result.userId,
      email,
      username: result.username,
      role,
      fullName: parsed.data.fullName.trim(),
    },
    needsVerification: true,
    ...(devTokensExposed() ? { devToken: verificationToken } : {}),
  };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * Resolve a login handle (identifier OR email) to a user row.
 * Returns null for unknown/malformed handles — callers respond generically.
 */
async function findUserByLoginHandle(handle: string): Promise<UserRow | null> {
  const trimmed = handle.trim();
  if (!trimmed) return null;
  if (isEmailLike(trimmed)) {
    return queryOne<UserRow>(
      "select id, email, username, password_hash, is_active, email_verified_at from public.users where email = $1",
      [normalizeEmail(trimmed)],
    );
  }
  const parsed = parseIdentifier(trimmed);
  if (!parsed.valid) return null;
  return queryOne<UserRow>(
    "select id, email, username, password_hash, is_active, email_verified_at from public.users where username = $1",
    [parsed.normalized],
  );
}

function rateLimitedLoginError(retryAfterSeconds: number | null): Error & {
  status?: number;
  retryAfterSeconds?: number | null;
} {
  const err = new Error("Too many login attempts. Please try again later.") as Error & {
    status?: number;
    retryAfterSeconds?: number | null;
  };
  err.status = 429;
  err.retryAfterSeconds = retryAfterSeconds;
  return err;
}

export async function loginPgUser(input: {
  identifier?: string;
  username?: string;
  email?: string;
  password?: unknown;
  ip: string;
}): Promise<{ user: PgSafeUser; token: string; expiresAt: Date }> {
  const coerced = coerceLoginInput(input);
  const parsed = pgLoginSchema.safeParse(coerced);
  const policy = authRateLimitConfig.login;
  const ip = input.ip;
  if (!parsed.success) {
    const ipCheck = await checkPgRateLimit(`login:ip:${ip}`, policy);
    if (!ipCheck.allowed) throw rateLimitedLoginError(ipCheck.retryAfterSeconds);
    throw new Error(GENERIC_PG_LOGIN_ERROR);
  }

  // Credential key (what was typed) + account key (who it resolves to).
  // The account key is what prevents bypass by switching between a user's
  // identifier and email: both resolve to the same users.id.
  const rawHandle = coerced.username.trim();
  const loginCtx = authLogContextFor(isEmailLike(rawHandle) ? normalizeEmail(rawHandle) : null, ip);
  const credKey = `login:cred:${rawHandle.toLowerCase()}`;
  const user = await findUserByLoginHandle(coerced.username);
  const userKey = user ? `login:user:${user.id}` : null;
  const keys = [`login:ip:${ip}`, credKey, ...(userKey ? [userKey] : [])];

  const checks = await Promise.all(keys.map((k) => checkPgRateLimit(k, policy)));
  const blockedIdx = checks.findIndex((c) => !c.allowed);
  if (blockedIdx >= 0) {
    logAuthEvent("login_rate_limited", loginCtx);
    throw rateLimitedLoginError(checks[blockedIdx].retryAfterSeconds);
  }

  const passwordOk = user
    ? await verifyPassword(user.password_hash, parsed.data.password)
    : await verifyPassword(await dummyHashValue(), parsed.data.password).then(() => false);
  if (!user || !user.is_active || !passwordOk) {
    await Promise.all(keys.map((k) => recordPgFailure(k, policy)));
    logAuthEvent("login_failure", loginCtx);
    throw new Error(GENERIC_PG_LOGIN_ERROR);
  }

  const profile = await queryOne<ProfileRow>(
    "select role, full_name from public.profiles where id = $1",
    [user.id],
  );
  if (!profile) throw new Error(GENERIC_PG_LOGIN_ERROR);

  await Promise.all(keys.map((k) => recordPgSuccess(k)));
  const { token, expiresAt } = await createSession(user.id);
  await getPool().query("update public.users set last_login_at = now() where id = $1", [user.id]);
  logAuthEvent("login_success", loginCtx);
  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: profile.role,
      fullName: profile.full_name,
    },
    token,
    expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Email verification (single-use, expiring tokens)
// ---------------------------------------------------------------------------

export async function verifyPgEmail(token: string): Promise<PgSafeUser> {
  const row = await queryOne<{ user_id: string; expires_at: string }>(
    "select user_id, expires_at from public.email_verifications where token_hash = $1",
    [tokenHash(token)],
  );
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    if (row) {
      await getPool().query("delete from public.email_verifications where token_hash = $1", [
        tokenHash(token),
      ]);
    }
    throw new Error(INVALID_TOKEN_MESSAGE);
  }
  const user = await withTransaction(async (tx) => {
    await tx.query("update public.users set email_verified_at = coalesce(email_verified_at, now()) where id = $1", [
      row.user_id,
    ]);
    await tx.query("delete from public.email_verifications where token_hash = $1", [
      tokenHash(token),
    ]);
    const res = await tx.query<{ id: string; email: string; username: string }>(
      "select id, email, username from public.users where id = $1",
      [row.user_id],
    );
    const prof = await tx.query<ProfileRow>(
      "select role, full_name from public.profiles where id = $1",
      [row.user_id],
    );
    return {
      id: res.rows[0].id,
      email: res.rows[0].email,
      username: res.rows[0].username,
      role: prof.rows[0].role,
      fullName: prof.rows[0].full_name,
    } satisfies PgSafeUser;
  });
  return user;
}

// ---------------------------------------------------------------------------
// Password reset (single-use, expiring tokens, generic responses)
// ---------------------------------------------------------------------------

export async function requestPgPasswordReset(input: {
  username?: string;
  email?: string;
  ip: string;
}): Promise<{ devToken?: string }> {
  const raw =
    typeof input.username === "string" && input.username.trim()
      ? input.username.trim()
      : typeof input.email === "string"
        ? input.email
        : "";
  const emailLike = isEmailLike(raw);
  const normalizedCred = emailLike ? normalizeEmail(raw) : normalizeIdentifier(raw);
  const usable = emailLike
    ? normalizedCred.includes("@") && normalizedCred.length <= 320
    : parseIdentifier(raw).valid;
  const policy = authRateLimitConfig.recovery;
  const credKey = `recovery:cred:${normalizedCred.toLowerCase()}`;
  const resolved = usable ? await findUserByLoginHandle(raw) : null;
  const userKey = resolved ? `recovery:user:${resolved.id}` : null;
  const keys = [`recovery:ip:${input.ip}`, credKey, ...(userKey ? [userKey] : [])];
  const recoveryCtx = authLogContextFor(emailLike ? normalizedCred : null, input.ip);
  const checks = await Promise.all(keys.map((k) => checkPgRateLimit(k, policy)));
  const blockedIdx = checks.findIndex((c) => !c.allowed);
  if (blockedIdx >= 0) {
    logAuthEvent("recovery_rate_limited", recoveryCtx);
    const err = new Error("Too many requests. Please try again later.") as Error & {
      status?: number;
      retryAfterSeconds?: number | null;
    };
    err.status = 429;
    err.retryAfterSeconds = checks[blockedIdx].retryAfterSeconds;
    throw err;
  }
  if (!usable) throw new Error("Please enter a valid email address.");

  const user = resolved;
  await Promise.all(keys.map((k) => recordPgFailure(k, policy)));
  logAuthEvent("recovery_requested", recoveryCtx);
  if (!user) return {}; // Generic — never reveal whether the account exists.

  const token = newToken();
  const pool = getPool();
  await pool.query("delete from public.password_resets where user_id = $1 and used_at is null", [
    user.id,
  ]);
  await pool.query(
    `insert into public.password_resets (user_id, token_hash, expires_at)
     values ($1, $2, now() + make_interval(secs => $3))`,
    [user.id, tokenHash(token), PASSWORD_RESET_TTL_SECONDS],
  );
  // Best-effort reset dispatch (never fails the request, never logs tokens).
  try {
    await resolveEmailProvider(emailProviderKind()).sendPasswordResetEmail({
      to: user.email,
      resetUrl: passwordResetUrl(token),
    });
  } catch {
    // Email delivery is auxiliary; the token row already exists.
  }
  return devTokensExposed() ? { devToken: token } : {};
}

export async function resetPgPassword(input: {
  token: string;
  password: string;
}): Promise<PgSafeUser> {
  const password = pgPasswordSchema.parse(input.password);
  const row = await queryOne<{ user_id: string; expires_at: string; used_at: string | null }>(
    "select user_id, expires_at, used_at from public.password_resets where token_hash = $1",
    [tokenHash(input.token)],
  );
  if (!row || row.used_at !== null || Date.parse(row.expires_at) <= Date.now()) {
    throw new Error(INVALID_TOKEN_MESSAGE);
  }
  const passwordHash = await hashPassword(password);
  const userId = row.user_id;
  const user = await withTransaction(async (tx) => {
    await tx.query("update public.users set password_hash = $2 where id = $1", [userId, passwordHash]);
    await tx.query("update public.password_resets set used_at = now() where token_hash = $1", [
      tokenHash(input.token),
    ]);
    await tx.query("delete from public.sessions where user_id = $1", [userId]);
    const res = await tx.query<{ id: string; email: string; username: string }>(
      "select id, email, username from public.users where id = $1",
      [userId],
    );
    const prof = await tx.query<ProfileRow>(
      "select role, full_name from public.profiles where id = $1",
      [userId],
    );
    return {
      id: res.rows[0].id,
      email: res.rows[0].email,
      username: res.rows[0].username,
      role: prof.rows[0].role,
      fullName: prof.rows[0].full_name,
    } satisfies PgSafeUser;
  });
  return user;
}

// ---------------------------------------------------------------------------
// Controlled provisioning (admin creation, tests). Never exposed publicly.
// ---------------------------------------------------------------------------

export async function createPgAdmin(input: {
  email: string;
  password: string;
  fullName: string;
}): Promise<PgSafeUser> {
  const email = normalizeEmail(z.string().email().parse(input.email));
  const password = pgPasswordSchema.parse(input.password);
  const fullName = z.string().trim().min(3).max(200).parse(input.fullName);
  const passwordHash = await hashPassword(password);
  const created = await withTransaction(async (tx) => {
    const seqRes = await tx.query<{ nextval: string }>(
      `select nextval('${sequenceForCategory("admin")}') as nextval`,
    );
    const username = formatIdentifier(
      "admin",
      new Date().getFullYear(),
      Number.parseInt(seqRes.rows[0].nextval, 10),
    );
    const res = await tx.query<{ id: string }>(
      `insert into public.users (email, username, password_hash, email_verified_at)
       values ($1, $2, $3, now()) returning id`,
      [email, username, passwordHash],
    );
    const id = res.rows[0].id;
    await tx.query(
      `insert into public.profiles (id, full_name, email, role) values ($1, $2, $3, 'admin')`,
      [id, fullName, email],
    );
    return { id, username };
  });
  return { id: created.id, email, username: created.username, role: "admin", fullName };
}

/** Deactivate/activate a login (admin lockout, tests). */
export async function setPgUserActive(userId: string, isActive: boolean): Promise<void> {
  await getPool().query("update public.users set is_active = $2 where id = $1", [userId, isActive]);
  if (!isActive) {
    await getPool().query("delete from public.sessions where user_id = $1", [userId]);
  }
}

/** Test/admin helper: reset one rate-limit key. */
export async function resetPgRateLimitForTests(key: string): Promise<void> {
  await resetPgKey(key);
}
