/**
 * LCSS — auth rate-limit core tests (in-memory store, deterministic clock).
 *
 * Covers: first failure allowed, 5-allowed-then-6th-blocked, expiry, success
 * clears state, IP/email isolation, normalization, independent
 * recovery/register limiters, no-password storage, generic messages, and
 * progressive hint. Live PostgreSQL limiter behavior is covered separately
 * (`src/lib/auth/pg-rate-limit.test.ts`, real database) — no live DB needed
 * here.
 */
import { describe, expect, it } from "vitest";
import {
  AUTH_LOGIN_POLICY_DEFAULT,
  AUTH_RECOVERY_POLICY_DEFAULT,
  AUTH_REGISTER_POLICY_DEFAULT,
  readConfig,
} from "@/lib/security/auth-rate-limit-config";
import { normalizeEmail } from "@/lib/security/normalize-email";
import { getClientIp } from "@/lib/security/get-client-ip";
import {
  GENERIC_AUTH_ERROR,
  RATE_LIMITED_MESSAGE,
  GENERIC_RECOVERY_SUCCESS,
  RECOVERY_RATE_LIMITED_MESSAGE,
  REGISTER_RATE_LIMITED_MESSAGE,
  MemoryRateLimitStore,
  checkRateLimit,
  evaluateLimit,
  isNearLimit,
  loginEmailKey,
  loginIpKey,
  recordFailure,
  recordSuccess,
  recoveryEmailKey,
  recoveryIpKey,
  registerIpKey,
  reset,
} from "@/lib/security/rate-limit";
import { hashIdentifier } from "@/lib/security/auth-log";

const LOGIN = AUTH_LOGIN_POLICY_DEFAULT; // 5 / 300s / 900s
const T0 = 1_700_000_000_000;

function freshStore() {
  return new MemoryRateLimitStore();
}

/** Drive N full attempts: pre-check must allow, then record the failure. */
async function driveFailures(
  store: MemoryRateLimitStore,
  key: string,
  n: number,
  startAt = T0,
) {
  for (let i = 0; i < n; i++) {
    const now = startAt + i * 1000;
    const pre = await checkRateLimit(store, key, LOGIN, now);
    expect(pre.allowed).toBe(true);
    await recordFailure(store, key, LOGIN, now);
  }
}

describe("login attempt policy (5 within 5min, 15min lockout)", () => {
  it("1. first failed login is allowed", async () => {
    const store = freshStore();
    const pre = await checkRateLimit(store, loginIpKey("10.0.0.1"), LOGIN, T0);
    expect(pre.allowed).toBe(true);
    expect(pre.remaining).toBe(5);
    const post = await recordFailure(store, loginIpKey("10.0.0.1"), LOGIN, T0);
    expect(post.remaining).toBe(4);
  });

  it("2. five failed attempts are allowed per policy", async () => {
    const store = freshStore();
    await driveFailures(store, loginEmailKey("a@x.edu"), 5);
    const record = await store.get(loginEmailKey("a@x.edu"));
    expect(record?.attempts).toBe(5);
  });

  it("3. sixth attempt is rate limited with a retry-after", async () => {
    const store = freshStore();
    await driveFailures(store, loginEmailKey("a@x.edu"), 5);
    const sixth = await checkRateLimit(
      store,
      loginEmailKey("a@x.edu"),
      LOGIN,
      T0 + 5000,
    );
    expect(sixth.allowed).toBe(false);
    expect(sixth.remaining).toBe(0);
    expect(sixth.retryAfterSeconds).not.toBeNull();
    expect(sixth.retryAfterSeconds!).toBeGreaterThan(0);
    expect(sixth.retryAfterSeconds!).toBeLessThanOrEqual(900);
  });

  it("4. rate limit expires after the lockout window", async () => {
    const store = freshStore();
    await driveFailures(store, loginEmailKey("a@x.edu"), 5);
    const blocked = await checkRateLimit(
      store,
      loginEmailKey("a@x.edu"),
      LOGIN,
      T0 + 5000,
    );
    expect(blocked.allowed).toBe(false);
    const afterLockout = await checkRateLimit(
      store,
      loginEmailKey("a@x.edu"),
      LOGIN,
      T0 + 5000 + 901 * 1000,
    );
    expect(afterLockout.allowed).toBe(true);
    expect(afterLockout.remaining).toBe(5);
  });

  it("window expiry without lockout resets the counter", async () => {
    const store = freshStore();
    const key = loginIpKey("10.0.0.9");
    await recordFailure(store, key, LOGIN, T0);
    await recordFailure(store, key, LOGIN, T0 + 1000);
    // 301s later the 300s window has lapsed → fresh bucket.
    const later = await checkRateLimit(store, key, LOGIN, T0 + 301 * 1000);
    expect(later.allowed).toBe(true);
    expect(later.remaining).toBe(5);
  });

  it("5. successful login clears the failure state", async () => {
    const store = freshStore();
    const key = loginEmailKey("student@x.edu");
    await driveFailures(store, key, 4);
    await recordSuccess(store, key);
    const after = await checkRateLimit(store, key, LOGIN, T0 + 4000);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(5);
    // reset() behaves the same (admin/test hook).
    await driveFailures(store, key, 2, T0 + 10_000);
    await reset(store, key);
    const afterReset = await checkRateLimit(store, key, LOGIN, T0 + 12_000);
    expect(afterReset.remaining).toBe(5);
  });

  it("success on one account does not clear another account", async () => {
    const store = freshStore();
    await driveFailures(store, loginEmailKey("victim@x.edu"), 5);
    await recordSuccess(store, loginEmailKey("attacker@x.edu"));
    const victim = await checkRateLimit(
      store,
      loginEmailKey("victim@x.edu"),
      LOGIN,
      T0 + 5000,
    );
    expect(victim.allowed).toBe(false);
  });
});

describe("isolation", () => {
  it("6. different IPs are isolated", async () => {
    const store = freshStore();
    await driveFailures(store, loginIpKey("192.168.1.1"), 5);
    const other = await checkRateLimit(
      store,
      loginIpKey("192.168.1.2"),
      LOGIN,
      T0 + 5000,
    );
    expect(other.allowed).toBe(true);
    expect(other.remaining).toBe(5);
  });

  it("7. different normalized emails are handled correctly", async () => {
    const store = freshStore();
    await driveFailures(store, loginEmailKey("one@x.edu"), 5);
    const other = await checkRateLimit(
      store,
      loginEmailKey("two@x.edu"),
      LOGIN,
      T0 + 5000,
    );
    expect(other.allowed).toBe(true);
  });

  it("either limit (IP or email) rejects the request", async () => {
    const store = freshStore();
    // Only the IP bucket exhausted…
    await driveFailures(store, loginIpKey("9.9.9.9"), 5);
    const ipHit = await checkRateLimit(
      store,
      loginIpKey("9.9.9.9"),
      LOGIN,
      T0 + 5000,
    );
    const emailFresh = await checkRateLimit(
      store,
      loginEmailKey("fresh@x.edu"),
      LOGIN,
      T0 + 5000,
    );
    expect(ipHit.allowed).toBe(false);
    expect(emailFresh.allowed).toBe(true);
    // …and only the email bucket exhausted.
    const store2 = freshStore();
    await driveFailures(store2, loginEmailKey("hot@x.edu"), 5);
    const emailHit = await checkRateLimit(
      store2,
      loginEmailKey("hot@x.edu"),
      LOGIN,
      T0 + 5000,
    );
    expect(emailHit.allowed).toBe(false);
  });
});

describe("email normalization", () => {
  it("8. trims whitespace and lowercases", () => {
    expect(normalizeEmail("  John.Smith@University.edu  ")).toBe(
      "john.smith@university.edu",
    );
    expect(normalizeEmail("A@X.EDU")).toBe("a@x.edu");
    expect(normalizeEmail("")).toBe("");
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(42)).toBe("");
  });

  it("key design uses the normalized email, never the raw form", () => {
    const raw = "  John.Smith@University.edu ";
    expect(loginEmailKey(normalizeEmail(raw))).toBe(
      "login:email:john.smith@university.edu",
    );
    expect(loginEmailKey(normalizeEmail(raw))).not.toContain(" ");
    expect(loginEmailKey(normalizeEmail(raw))).not.toContain("John");
  });
});

describe("independent recovery / registration limiters", () => {
  it("9. recovery is independently rate limited (3/hour)", async () => {
    const store = freshStore();
    const policy = AUTH_RECOVERY_POLICY_DEFAULT;
    expect(policy.maxAttempts).toBe(3);
    expect(policy.windowSeconds).toBe(3600);
    const key = recoveryEmailKey("s@x.edu");
    for (let i = 0; i < 3; i++) {
      const pre = await checkRateLimit(store, key, policy, T0 + i * 1000);
      expect(pre.allowed).toBe(true);
      await recordFailure(store, key, policy, T0 + i * 1000);
    }
    const fourth = await checkRateLimit(store, key, policy, T0 + 3000);
    expect(fourth.allowed).toBe(false);
  });

  it("10. registration is independently rate limited (5/hour)", async () => {
    const store = freshStore();
    const policy = AUTH_REGISTER_POLICY_DEFAULT;
    expect(policy.maxAttempts).toBe(5);
    expect(policy.windowSeconds).toBe(3600);
    const key = registerIpKey("7.7.7.7");
    for (let i = 0; i < 5; i++) {
      const pre = await checkRateLimit(store, key, policy, T0 + i * 1000);
      expect(pre.allowed).toBe(true);
      await recordFailure(store, key, policy, T0 + i * 1000);
    }
    const sixth = await checkRateLimit(store, key, policy, T0 + 5000);
    expect(sixth.allowed).toBe(false);
  });

  it("exhausting login does not block recovery or registration", async () => {
    const store = freshStore();
    await driveFailures(store, loginEmailKey("s@x.edu"), 5);
    await driveFailures(store, loginIpKey("1.2.3.4"), 5);
    const rec = await checkRateLimit(
      store,
      recoveryEmailKey("s@x.edu"),
      AUTH_RECOVERY_POLICY_DEFAULT,
      T0 + 5000,
    );
    const reg = await checkRateLimit(
      store,
      registerIpKey("1.2.3.4"),
      AUTH_REGISTER_POLICY_DEFAULT,
      T0 + 5000,
    );
    expect(rec.allowed).toBe(true);
    expect(reg.allowed).toBe(true);
  });

  it("recovery IP and email keys are namespaced apart from login keys", () => {
    expect(recoveryIpKey("1.1.1.1")).toBe("recovery:ip:1.1.1.1");
    expect(recoveryEmailKey("a@x.edu")).toBe("recovery:email:a@x.edu");
    expect(registerIpKey("1.1.1.1")).toBe("register:ip:1.1.1.1");
    expect(loginIpKey("1.1.1.1")).not.toBe(recoveryIpKey("1.1.1.1"));
    expect(loginEmailKey("a@x.edu")).not.toBe(recoveryEmailKey("a@x.edu"));
  });
});

describe("no secrets in rate-limit data", () => {
  it("11. records hold counters + timestamps only", async () => {
    const store = freshStore();
    const key = loginEmailKey("s@x.edu");
    await recordFailure(store, key, LOGIN, T0);
    const record = await store.get(key);
    expect(record).not.toBeNull();
    expect(Object.keys(record!).sort()).toEqual(
      ["attempts", "blockedUntil", "firstAttemptAt", "lastAttemptAt"].sort(),
    );
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("secret");
  });
});

describe("generic messages", () => {
  it("12. auth errors never reveal account existence", () => {
    expect(GENERIC_AUTH_ERROR).toBe("Invalid email or password.");
    for (const msg of [
      GENERIC_AUTH_ERROR,
      RATE_LIMITED_MESSAGE,
      RECOVERY_RATE_LIMITED_MESSAGE,
      REGISTER_RATE_LIMITED_MESSAGE,
      GENERIC_RECOVERY_SUCCESS,
    ]) {
      const lower = msg.toLowerCase();
      expect(lower).not.toContain("not exist");
      expect(lower).not.toContain("incorrect password");
      expect(lower).not.toContain("no such user");
      expect(lower).not.toContain("unknown user");
    }
    expect(RATE_LIMITED_MESSAGE).toContain("Too many login attempts");
    // The rate-limit message must not say which key (email vs IP) fired.
    expect(RATE_LIMITED_MESSAGE.toLowerCase()).not.toContain("email");
    expect(RATE_LIMITED_MESSAGE.toLowerCase()).not.toContain(" ip");
  });
});

describe("progressive protection + evaluation edges", () => {
  it("near-limit hint fires with one attempt remaining", () => {
    const policy = AUTH_LOGIN_POLICY_DEFAULT;
    expect(
      isNearLimit({ allowed: true, retryAfterSeconds: null, remaining: 1 }, policy),
    ).toBe(true);
    expect(
      isNearLimit({ allowed: true, retryAfterSeconds: null, remaining: 2 }, policy),
    ).toBe(false);
    expect(
      isNearLimit({ allowed: false, retryAfterSeconds: 60, remaining: 0 }, policy),
    ).toBe(false);
  });

  it("evaluateLimit caps retry-after at >= 1s and honors expiry", () => {
    const policy = AUTH_LOGIN_POLICY_DEFAULT;
    const blockedSoon = evaluateLimit(
      { attempts: 5, firstAttemptAt: T0, lastAttemptAt: T0, blockedUntil: T0 + 400 },
      policy,
      T0,
    );
    expect(blockedSoon.allowed).toBe(false);
    expect(blockedSoon.retryAfterSeconds).toBe(1);
    const expired = evaluateLimit(
      { attempts: 5, firstAttemptAt: T0, lastAttemptAt: T0, blockedUntil: T0 + 1000 },
      policy,
      T0 + 2000,
    );
    expect(expired.allowed).toBe(true);
  });
});

describe("client IP extraction", () => {
  it("prefers the first x-forwarded-for entry (Vercel/trusted proxy)", () => {
    const h = new Headers();
    h.set("x-forwarded-for", "203.0.113.7, 70.41.3.18, 150.172.238.4");
    expect(getClientIp(h)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then unknown", () => {
    const h = new Headers();
    h.set("x-real-ip", "198.51.100.9");
    expect(getClientIp(h)).toBe("198.51.100.9");
    expect(getClientIp(new Headers())).toBe("unknown");
  });

  it("ignores untrusted / malformed headers, works with plain records", () => {
    const h = new Headers();
    h.set("x-forwarded-for", "not-an-ip!!!");
    h.set("x-evil-client-ip", "1.2.3.4");
    expect(getClientIp(h)).toBe("unknown");
    expect(getClientIp({ "x-forwarded-for": "10.1.2.3" })).toBe("10.1.2.3");
  });
});

describe("env configuration", () => {
  it("defaults match the required policy", () => {
    expect(AUTH_LOGIN_POLICY_DEFAULT).toEqual({
      maxAttempts: 5,
      windowSeconds: 300,
      lockoutSeconds: 900,
    });
    expect(AUTH_RECOVERY_POLICY_DEFAULT).toEqual({
      maxAttempts: 3,
      windowSeconds: 3600,
      lockoutSeconds: 3600,
    });
    expect(AUTH_REGISTER_POLICY_DEFAULT).toEqual({
      maxAttempts: 5,
      windowSeconds: 3600,
      lockoutSeconds: 3600,
    });
  });

  it("env overrides apply; garbage falls back to defaults", () => {
    const cfg = readConfig({
      AUTH_LOGIN_MAX_ATTEMPTS: "10",
      AUTH_LOGIN_WINDOW_SECONDS: "60",
      AUTH_LOGIN_LOCKOUT_SECONDS: "120",
      AUTH_RECOVERY_MAX_ATTEMPTS: "7",
      AUTH_RECOVERY_WINDOW_SECONDS: "100",
      AUTH_REGISTER_MAX_ATTEMPTS: "9",
      AUTH_REGISTER_WINDOW_SECONDS: "200",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.login).toEqual({
      maxAttempts: 10,
      windowSeconds: 60,
      lockoutSeconds: 120,
    });
    expect(cfg.recovery.maxAttempts).toBe(7);
    expect(cfg.register.maxAttempts).toBe(9);
    const bad = readConfig({
      AUTH_LOGIN_MAX_ATTEMPTS: "zero",
      AUTH_LOGIN_WINDOW_SECONDS: "-5",
      AUTH_LOGIN_LOCKOUT_SECONDS: "",
    } as unknown as NodeJS.ProcessEnv);
    expect(bad.login).toEqual(AUTH_LOGIN_POLICY_DEFAULT);
  });
});

describe("log redaction", () => {
  it("identifier hashes never contain the raw email", () => {
    const hash = hashIdentifier("john.smith@university.edu");
    expect(hash).not.toContain("john");
    expect(hash).not.toContain("university");
    expect(hashIdentifier("a@x.edu")).toBe(hashIdentifier("a@x.edu"));
    expect(hashIdentifier("a@x.edu")).not.toBe(hashIdentifier("b@x.edu"));
  });
});
