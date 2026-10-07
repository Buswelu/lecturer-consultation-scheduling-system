/**
 * LCSS — PostgreSQL-backed rate-limit store for self-managed auth.
 *
 * SERVER-ONLY. The live limiter for the new auth system: atomic operations
 * on `public.auth_rate_limits` with the same counter semantics as the pure
 * helpers in `lib/security/rate-limit.ts`.
 *
 * Race safety: `recordFailureAtomic` runs SELECT … FOR UPDATE + upsert inside
 * one transaction, so concurrent requests serialize on the key's row. A lost
 * insert race (two creators) retries once. `checkRateLimit` is read-only and
 * needs no lock — worst case it observes a block one request later, which
 * cannot bypass the limit because counting itself is atomic.
 *
 * Never stores passwords, tokens, or secrets — key + counters + timestamps.
 */
import "server-only";
import { getPool } from "@/lib/db/pool";
import type { RateLimitPolicy } from "@/lib/security/auth-rate-limit-config";
import {
  evaluateLimit,
  type RateLimitDecision,
  type RateLimitRecord,
} from "@/lib/security/rate-limit";

interface RateLimitRow {
  key: string;
  attempts: number;
  first_attempt_at: string;
  last_attempt_at: string;
  blocked_until: string | null;
}

function rowToRecord(row: RateLimitRow): RateLimitRecord {
  return {
    attempts: row.attempts,
    firstAttemptAt: Date.parse(row.first_attempt_at),
    lastAttemptAt: Date.parse(row.last_attempt_at),
    blockedUntil: row.blocked_until ? Date.parse(row.blocked_until) : null,
  };
}

function toRowParams(key: string, record: RateLimitRecord): unknown[] {
  return [
    key,
    record.attempts,
    new Date(record.firstAttemptAt).toISOString(),
    new Date(record.lastAttemptAt).toISOString(),
    record.blockedUntil === null
      ? null
      : new Date(record.blockedUntil).toISOString(),
  ];
}

const UPSERT_SQL = `insert into public.auth_rate_limits
    (key, attempts, first_attempt_at, last_attempt_at, blocked_until)
  values ($1, $2, $3, $4, $5)
  on conflict (key) do update set
    attempts = excluded.attempts,
    first_attempt_at = excluded.first_attempt_at,
    last_attempt_at = excluded.last_attempt_at,
    blocked_until = excluded.blocked_until,
    updated_at = now()`;

/**
 * Compute the next record after a failure, mirroring `recordFailure` in
 * `lib/security/rate-limit.ts` exactly (window expiry and spent lockouts
 * restart the bucket; hitting maxAttempts arms the lockout).
 */
function nextAfterFailure(
  existing: RateLimitRecord | null,
  policy: RateLimitPolicy,
  now: number,
): RateLimitRecord {
  let next: RateLimitRecord;
  if (
    !existing ||
    now - existing.firstAttemptAt >= policy.windowSeconds * 1000 ||
    (existing.blockedUntil !== null && now >= existing.blockedUntil)
  ) {
    next = { attempts: 1, firstAttemptAt: now, lastAttemptAt: now, blockedUntil: null };
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
  return next;
}

/** Read-only limit check for `key` (no lock, no writes). */
export async function checkPgRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now: number = Date.now(),
): Promise<RateLimitDecision> {
  const { rows } = await getPool().query<RateLimitRow>(
    "select key, attempts, first_attempt_at, last_attempt_at, blocked_until " +
      "from public.auth_rate_limits where key = $1",
    [key],
  );
  const record = rows[0] ? rowToRecord(rows[0]) : null;
  // Lazy expiry: drop stale buckets instead of growing the table.
  if (
    record &&
    ((record.blockedUntil !== null && now >= record.blockedUntil) ||
      now - record.firstAttemptAt >= policy.windowSeconds * 1000)
  ) {
    await getPool()
      .query("delete from public.auth_rate_limits where key = $1", [key])
      .catch(() => undefined);
    return {
      allowed: true,
      retryAfterSeconds: null,
      remaining: policy.maxAttempts,
    };
  }
  return evaluateLimit(record, policy, now);
}

/**
 * Atomically record a failure for `key`. Only call after a real auth
 * failure — never for malformed input, successes, or unrelated errors.
 */
export async function recordPgFailure(
  key: string,
  policy: RateLimitPolicy,
  now: number = Date.now(),
): Promise<RateLimitDecision> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      const { rows } = await client.query<RateLimitRow>(
        "select key, attempts, first_attempt_at, last_attempt_at, blocked_until " +
          "from public.auth_rate_limits where key = $1 for update",
        [key],
      );
      const next = nextAfterFailure(rows[0] ? rowToRecord(rows[0]) : null, policy, now);
      await client.query(UPSERT_SQL, toRowParams(key, next));
      await client.query("commit");
      return evaluateLimit(next, policy, now);
    } catch (err) {
      try {
        await client.query("rollback");
      } catch {
        // Ignore rollback errors; surface the original failure below.
      }
      // Concurrent creator lost the insert race — re-read and retry once.
      if (attempt === 0 && err instanceof Error && "code" in err &&
          (err as { code?: unknown }).code === "23505") {
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
  throw new Error("Rate-limit update failed.");
}

/** Clear the failure state for `key` (call on successful authentication). */
export async function recordPgSuccess(key: string): Promise<void> {
  await getPool()
    .query("delete from public.auth_rate_limits where key = $1", [key])
    .catch(() => undefined);
}

/** Test/admin helper: reset one key. */
export async function resetPgKey(key: string): Promise<void> {
  await recordPgSuccess(key);
}
