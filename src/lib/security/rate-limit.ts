/**
 * LCSS — authentication rate limiting (shared primitives).
 *
 * The live limiter is `src/lib/auth/rate-limit-pg.ts`: it enforces these
 * policies server-side with atomic PostgreSQL operations on
 * `public.auth_rate_limits` BEFORE password verification, so limits hold
 * across server instances. This module keeps the generic messages, key
 * builders, store interface, pure evaluation, and the in-memory store used
 * by unit tests. No passwords, tokens, or service keys are ever stored here.
 */

import type { RateLimitPolicy } from "./auth-rate-limit-config";

// ---------------------------------------------------------------------------
// Public messages (generic — never reveal account existence or which key hit)
// ---------------------------------------------------------------------------

export const GENERIC_AUTH_ERROR = "Invalid email or password.";
export const RATE_LIMITED_MESSAGE =
  "Too many login attempts. Please try again later.";
export const RECOVERY_RATE_LIMITED_MESSAGE =
  "Too many requests. Please try again later.";
export const REGISTER_RATE_LIMITED_MESSAGE =
  "Too many requests. Please try again later.";
export const GENERIC_RECOVERY_SUCCESS =
  "If an account exists for this email, you will receive a link shortly.";

// ---------------------------------------------------------------------------
// Key design — separate logical keys, normalized email only
// ---------------------------------------------------------------------------

export type RateLimitScope = "login" | "recovery" | "register";

export function loginIpKey(ip: string): string {
  return `login:ip:${ip}`;
}

export function loginEmailKey(normalizedEmail: string): string {
  return `login:email:${normalizedEmail}`;
}

export function recoveryIpKey(ip: string): string {
  return `recovery:ip:${ip}`;
}

export function recoveryEmailKey(normalizedEmail: string): string {
  return `recovery:email:${normalizedEmail}`;
}

export function registerIpKey(ip: string): string {
  return `register:ip:${ip}`;
}

// ---------------------------------------------------------------------------
// Store abstraction
// ---------------------------------------------------------------------------

/** Persisted counters for ONE rate-limit key. No secrets, ever. */
export interface RateLimitRecord {
  attempts: number;
  /** Epoch ms of the first attempt in the current window. */
  firstAttemptAt: number;
  /** Epoch ms of the last attempt. */
  lastAttemptAt: number;
  /** Epoch ms until which the key is blocked, or null. */
  blockedUntil: number | null;
}

export interface RateLimitStore {
  get(key: string): Promise<RateLimitRecord | null>;
  set(key: string, record: RateLimitRecord): Promise<void>;
  delete(key: string): Promise<void>;
  /** Best-effort removal of expired rows (keeps the table bounded). */
  pruneExpired(now: number): Promise<void>;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until retry when blocked (safe to expose to the client). */
  retryAfterSeconds: number | null;
  remaining: number;
}

// ---------------------------------------------------------------------------
// Pure evaluation (unit-testable, no I/O)
// ---------------------------------------------------------------------------

export function evaluateLimit(
  record: RateLimitRecord | null,
  policy: RateLimitPolicy,
  now: number,
): RateLimitDecision {
  if (!record) {
    return { allowed: true, retryAfterSeconds: null, remaining: policy.maxAttempts };
  }
  if (record.blockedUntil !== null && now < record.blockedUntil) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((record.blockedUntil - now) / 1000),
      ),
      remaining: 0,
    };
  }
  // Stale block or stale window → treated as fresh.
  if (record.blockedUntil !== null && now >= record.blockedUntil) {
    return { allowed: true, retryAfterSeconds: null, remaining: policy.maxAttempts };
  }
  if (now - record.firstAttemptAt >= policy.windowSeconds * 1000) {
    return { allowed: true, retryAfterSeconds: null, remaining: policy.maxAttempts };
  }
  if (record.attempts >= policy.maxAttempts) {
    const blockedUntil =
      record.blockedUntil ?? now + policy.lockoutSeconds * 1000;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - now) / 1000)),
      remaining: 0,
    };
  }
  return {
    allowed: true,
    retryAfterSeconds: null,
    remaining: policy.maxAttempts - record.attempts,
  };
}

// ---------------------------------------------------------------------------
// Operations — the clean interface required by the spec
// ---------------------------------------------------------------------------

export async function checkRateLimit(
  store: RateLimitStore,
  key: string,
  policy: RateLimitPolicy,
  now: number = Date.now(),
): Promise<RateLimitDecision> {
  const record = await store.get(key);
  // Lazy expiry: drop stale rows instead of letting the table grow unbounded.
  if (
    record &&
    ((record.blockedUntil !== null && now >= record.blockedUntil) ||
      now - record.firstAttemptAt >= policy.windowSeconds * 1000)
  ) {
    await store.delete(key).catch(() => undefined);
    return {
      allowed: true,
      retryAfterSeconds: null,
      remaining: policy.maxAttempts,
    };
  }
  return evaluateLimit(record, policy, now);
}

/**
 * Record an authentication FAILURE against `key`. Only call this when the
 * underlying auth provider actually reported a failure — never for malformed
 * requests, successes, or unrelated app errors.
 */
export async function recordFailure(
  store: RateLimitStore,
  key: string,
  policy: RateLimitPolicy,
  now: number = Date.now(),
): Promise<RateLimitDecision> {
  const existing = await store.get(key);
  let next: RateLimitRecord;
  if (
    !existing ||
    now - existing.firstAttemptAt >= policy.windowSeconds * 1000 ||
    (existing.blockedUntil !== null && now >= existing.blockedUntil)
  ) {
    next = {
      attempts: 1,
      firstAttemptAt: now,
      lastAttemptAt: now,
      blockedUntil: null,
    };
  } else {
    next = {
      attempts: existing.attempts + 1,
      firstAttemptAt: existing.firstAttemptAt,
      lastAttemptAt: now,
      blockedUntil: existing.blockedUntil,
    };
  }
  if (next.attempts >= policy.maxAttempts && next.blockedUntil === null) {
    next.blockedUntil = now + policy.lockoutSeconds * 1000;
  }
  await store.set(key, next);
  await store.pruneExpired(now).catch(() => undefined);
  return evaluateLimit(next, policy, now);
}

/**
 * Record a SUCCESS — clears the failure state for the key so a user who
 * authenticates successfully is never needlessly blocked.
 */
export async function recordSuccess(
  store: RateLimitStore,
  key: string,
): Promise<void> {
  await store.delete(key).catch(() => undefined);
}

/** Administrative / test reset of a single key. */
export async function reset(
  store: RateLimitStore,
  key: string,
): Promise<void> {
  await store.delete(key).catch(() => undefined);
}

/** True when the decision leaves ≤1 attempt before lockout (progressive UX). */
export function isNearLimit(
  decision: RateLimitDecision,
  policy: RateLimitPolicy,
): boolean {
  return decision.allowed && decision.remaining <= 1 && policy.maxAttempts > 1;
}

// ---------------------------------------------------------------------------
// In-memory store (tests + unconfigured-local fallback ONLY)
// ---------------------------------------------------------------------------

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly map = new Map<string, RateLimitRecord>();

  async get(key: string): Promise<RateLimitRecord | null> {
    return this.map.get(key) ?? null;
  }

  async set(key: string, record: RateLimitRecord): Promise<void> {
    // Store a copy; never retain caller-mutated references (and never
    // anything but counters + timestamps — no passwords/tokens by construction).
    this.map.set(key, { ...record });
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async pruneExpired(now: number): Promise<void> {
    for (const [key, record] of this.map) {
      const blockedExpired =
        record.blockedUntil !== null && now >= record.blockedUntil;
      // Heuristic bound: drop rows idle for > 2× the longest expected window.
      const idleTooLong = now - record.lastAttemptAt > 2 * 3600 * 1000;
      if (blockedExpired || idleTooLong) this.map.delete(key);
    }
  }

  /** Test helper — number of live buckets. */
  size(): number {
    return this.map.size;
  }
}

// ---------------------------------------------------------------------------
// Production PostgreSQL store
// ---------------------------------------------------------------------------
// The live limiter is `src/lib/auth/rate-limit-pg.ts` (atomic `pg`
// operations on `public.auth_rate_limits`, same counter semantics as the
// pure helpers below). This module keeps the shared messages, key builders,
// store interface, pure evaluation, and the in-memory store (unit tests).
// ---------------------------------------------------------------------------
