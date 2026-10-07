import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authRateLimitConfig } from "@/lib/security/auth-rate-limit-config";
import {
  checkPgRateLimit,
  recordPgFailure,
  recordPgSuccess,
} from "./rate-limit-pg";
import { loginPgUser, registerPgUser } from "./users";
import { GENERIC_PG_LOGIN_ERROR } from "./users";
import {
  assertTestDatabase,
  cleanupTestData,
  closeTestPool,
  setSuiteTag,
  testEmail,
  testIp,
} from "./test-helpers";

beforeAll(async () => {
  setSuiteTag("trl");
  await assertTestDatabase();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestPool();
});

describe("pg rate limiting", () => {
  it("blocks the sixth failed login after five failures (login policy)", async () => {
    const email = testEmail("ratelimit");
    const ip = testIp();
    await registerPgUser({
      email,
      password: "ratelimit-pass-123",
      fullName: "Rate Limit",
      role: "student",
      ip: testIp(),
    });
    for (let i = 0; i < 5; i++) {
      await expect(
        loginPgUser({ email, password: `wrong-${i}-xxxxxxxx`, ip }),
      ).rejects.toThrow(GENERIC_PG_LOGIN_ERROR);
    }
    const blocked = await loginPgUser({ email, password: "wrong-5-xxxxxxxx", ip }).catch(
      (e: Error) => e,
    );
    expect(blocked).toBeInstanceOf(Error);
    expect((blocked as Error).message).toMatch(/Too many login attempts/);
    expect((blocked as { status?: number }).status).toBe(429);
  });

  it("lockout expires and the bucket restarts (tiny policy)", async () => {
    const key = `trl-tiny-${Math.random().toString(36).slice(2)}`;
    const policy = { maxAttempts: 2, windowSeconds: 60, lockoutSeconds: 1 };
    await recordPgFailure(key, policy);
    await recordPgFailure(key, policy);
    expect((await checkPgRateLimit(key, policy)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    const after = await checkPgRateLimit(key, policy);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(policy.maxAttempts);
  });

  it("concurrent failures cannot bypass the limit (no lost updates)", async () => {
    const key = `trl-concurrent-${Math.random().toString(36).slice(2)}`;
    const policy = authRateLimitConfig.login;
    await Promise.all(Array.from({ length: 10 }, () => recordPgFailure(key, policy)));
    const decision = await checkPgRateLimit(key, policy);
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });

  it("success clears the failure state", async () => {
    const key = `trl-success-${Math.random().toString(36).slice(2)}`;
    const policy = authRateLimitConfig.login;
    await recordPgFailure(key, policy);
    await recordPgSuccess(key);
    const decision = await checkPgRateLimit(key, policy);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(policy.maxAttempts);
  });
});
