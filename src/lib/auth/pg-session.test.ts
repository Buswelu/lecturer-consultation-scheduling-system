import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import {
  buildSessionCookie,
  createSession,
  destroyAllUserSessions,
  destroySession,
  getSessionUser,
} from "./session";
import { loginPgUser, registerPgUser } from "./users";
import {
  assertTestDatabase,
  cleanupTestData,
  closeTestPool,
  setSuiteTag,
  testEmail,
  testIp,
} from "./test-helpers";

beforeAll(async () => {
  setSuiteTag("tsess");
  await assertTestDatabase();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestPool();
});

describe("pg sessions", () => {
  it("validates a live session and returns the identity", async () => {
    const email = testEmail("session");
    const reg = await registerPgUser({
      email,
      password: "session-pass-123",
      fullName: "Session User",
      role: "lecturer",
      ip: testIp(),
    });
    const { token } = await createSession(reg.user.id);
    const session = await getSessionUser(token);
    expect(session).toMatchObject({ userId: reg.user.id, email, role: "lecturer" });
  });

  it("rejects unknown tokens", async () => {
    expect(await getSessionUser("no-such-token")).toBeNull();
    expect(await getSessionUser(null)).toBeNull();
  });

  it("rejects expired sessions", async () => {
    const email = testEmail("expired");
    const reg = await registerPgUser({
      email,
      password: "expired-pass-123",
      fullName: "Expired Session",
      role: "student",
      ip: testIp(),
    });
    const { token } = await createSession(reg.user.id);
    await getPool().query(
      "update public.sessions set expires_at = now() - interval '1 minute' where user_id = $1",
      [reg.user.id],
    );
    expect(await getSessionUser(token)).toBeNull();
  });

  it("logout destroys the session", async () => {
    const email = testEmail("logout");
    await registerPgUser({
      email,
      password: "logout-pass-123",
      fullName: "Logout User",
      role: "student",
      ip: testIp(),
    });
    const login = await loginPgUser({ email, password: "logout-pass-123", ip: testIp() });
    expect(await getSessionUser(login.token)).not.toBeNull();
    await destroySession(login.token);
    expect(await getSessionUser(login.token)).toBeNull();
  });

  it("destroyAllUserSessions revokes every session", async () => {
    const email = testEmail("revoke");
    const reg = await registerPgUser({
      email,
      password: "revoke-pass-123",
      fullName: "Revoke User",
      role: "student",
      ip: testIp(),
    });
    const first = await createSession(reg.user.id);
    const second = await createSession(reg.user.id);
    await destroyAllUserSessions(reg.user.id);
    expect(await getSessionUser(first.token)).toBeNull();
    expect(await getSessionUser(second.token)).toBeNull();
  });

  it("deactivated accounts fail session validation even with live tokens", async () => {    const email = testEmail("deactivated-session");
    const reg = await registerPgUser({
      email,
      password: "deactivated-pass-123",
      fullName: "Deactivated Session",
      role: "student",
      ip: testIp(),
    });
    const { token } = await createSession(reg.user.id);
    expect(await getSessionUser(token)).not.toBeNull();
    const { setPgUserActive } = await import("./users");
    await setPgUserActive(reg.user.id, false);
    // Deactivation revokes sessions AND validation rejects inactive users.
    expect(await getSessionUser(token)).toBeNull();
  });

  it("session cookie is HttpOnly/Lax and Secure exactly in production", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    try {
      env.NODE_ENV = "development";
      const dev = buildSessionCookie("t".repeat(64));
      expect(dev.options.httpOnly).toBe(true);
      expect(dev.options.sameSite).toBe("lax");
      expect(dev.options.path).toBe("/");
      expect(dev.options.secure).toBe(false);
      expect(dev.options.maxAge).toBeGreaterThan(0);
      env.NODE_ENV = "production";
      expect(buildSessionCookie("t".repeat(64)).options.secure).toBe(true);
    } finally {
      env.NODE_ENV = previous;
    }
  });
});
