import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { authRateLimitConfig } from "@/lib/security/auth-rate-limit-config";
import { checkPgRateLimit } from "./rate-limit-pg";
import {
  GENERIC_PG_AUTH_ERROR,
  loginPgUser,
  registerPgUser,
  setPgUserActive,
} from "./users";
import {
  assertTestDatabase,
  cleanupTestData,
  closeTestPool,
  setSuiteTag,
  testEmail,
  testIp,
} from "./test-helpers";

beforeAll(async () => {
  setSuiteTag("tlogin");
  await assertTestDatabase();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestPool();
});

describe("pg login", () => {
  it("logs in with correct credentials and creates a session", async () => {
    const email = testEmail("login-ok");
    await registerPgUser({
      email,
      password: "login-pass-123",
      fullName: "Login User",
      role: "student",
      ip: testIp(),
    });
    const result = await loginPgUser({ email, password: "login-pass-123", ip: testIp() });
    expect(result.user.email).toBe(email);
    expect(result.user.role).toBe("student");
    expect(result.token.length).toBeGreaterThan(32);

    const sessions = await getPool().query(
      "select id from public.sessions where user_id = $1",
      [result.user.id],
    );
    expect(sessions.rows.length).toBe(1);

    const lastLogin = await getPool().query<{ last_login_at: string | null }>(
      "select last_login_at from public.users where id = $1",
      [result.user.id],
    );
    expect(lastLogin.rows[0].last_login_at).not.toBeNull();
  });

  it("rejects incorrect password with the generic error", async () => {
    const email = testEmail("login-bad");
    await registerPgUser({
      email,
      password: "right-pass-123",
      fullName: "Bad Password",
      role: "student",
      ip: testIp(),
    });
    await expect(
      loginPgUser({ email, password: "wrong-pass-456", ip: testIp() }),
    ).rejects.toThrow(GENERIC_PG_AUTH_ERROR);
  });

  it("rejects nonexistent email with the SAME generic error (no enumeration)", async () => {
    const missing = await loginPgUser({
      email: testEmail("nobody"),
      password: "whatever-123",
      ip: testIp(),
    }).catch((e: Error) => e);
    const wrongPw = await loginPgUser({
      email: testEmail("alsonobody"),
      password: "whatever-123",
      ip: testIp(),
    }).catch((e: Error) => e);
    expect(missing).toBeInstanceOf(Error);
    expect((missing as Error).message).toBe(GENERIC_PG_AUTH_ERROR);
    expect((wrongPw as Error).message).toBe(GENERIC_PG_AUTH_ERROR);
  });

  it("rejects inactive users", async () => {
    const email = testEmail("inactive");
    const reg = await registerPgUser({
      email,
      password: "inactive-pass-123",
      fullName: "Inactive User",
      role: "student",
      ip: testIp(),
    });
    await setPgUserActive(reg.user.id, false);
    await expect(
      loginPgUser({ email, password: "inactive-pass-123", ip: testIp() }),
    ).rejects.toThrow(GENERIC_PG_AUTH_ERROR);
  });

  it("successful login clears the failed-login state", async () => {
    const email = testEmail("login-reset");
    const ip = testIp();
    await registerPgUser({
      email,
      password: "reset-pass-123",
      fullName: "Reset State",
      role: "student",
      ip: testIp(),
    });
    await loginPgUser({ email, password: "bad-1-xxxxx", ip }).catch(() => undefined);
    await loginPgUser({ email, password: "bad-2-xxxxx", ip }).catch(() => undefined);
    await loginPgUser({ email, password: "reset-pass-123", ip });
    const check = await checkPgRateLimit(
      `login:cred:${email}`,
      authRateLimitConfig.login,
    );
    expect(check.remaining).toBe(authRateLimitConfig.login.maxAttempts);
  });
});
