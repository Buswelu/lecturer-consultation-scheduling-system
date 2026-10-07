import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import {
  INVALID_TOKEN_MESSAGE,
  loginPgUser,
  registerPgUser,
  requestPgPasswordReset,
  resetPgPassword,
  verifyPgEmail,
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
  setSuiteTag("trv");
  await assertTestDatabase();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestPool();
});

describe("pg password reset", () => {
  it("resets with a valid token and revokes sessions", async () => {
    const email = testEmail("reset");
    await registerPgUser({
      email,
      password: "old-pass-123",
      fullName: "Reset User",
      role: "student",
      ip: testIp(),
    });
    const before = await loginPgUser({ email, password: "old-pass-123", ip: testIp() });
    const { devToken } = await requestPgPasswordReset({ email, ip: testIp() });
    expect(devToken).toBeDefined();

    await resetPgPassword({ token: devToken as string, password: "new-pass-456" });

    // Old password fails, new password works, old session revoked.
    await expect(
      loginPgUser({ email, password: "old-pass-123", ip: testIp() }),
    ).rejects.toThrow();
    const after = await loginPgUser({ email, password: "new-pass-456", ip: testIp() });
    expect(after.user.email).toBe(email);
    const { getSessionUser } = await import("./session");
    expect(await getSessionUser(before.token)).toBeNull();
  });

  it("rejects invalid tokens", async () => {
    await expect(
      resetPgPassword({ token: "no-such-token", password: "new-pass-456" }),
    ).rejects.toThrow(INVALID_TOKEN_MESSAGE);
  });

  it("rejects expired tokens", async () => {
    const email = testEmail("reset-expired");
    await registerPgUser({
      email,
      password: "old-pass-123",
      fullName: "Expired Token",
      role: "student",
      ip: testIp(),
    });
    const { devToken } = await requestPgPasswordReset({ email, ip: testIp() });
    await getPool().query(
      "update public.password_resets set expires_at = now() - interval '1 minute' where user_id = (select id from public.users where email = $1)",
      [email],
    );
    await expect(
      resetPgPassword({ token: devToken as string, password: "new-pass-456" }),
    ).rejects.toThrow(INVALID_TOKEN_MESSAGE);
  });

  it("tokens cannot be reused", async () => {
    const email = testEmail("reset-reuse");
    await registerPgUser({
      email,
      password: "old-pass-123",
      fullName: "Reuse Token",
      role: "student",
      ip: testIp(),
    });
    const { devToken } = await requestPgPasswordReset({ email, ip: testIp() });
    await resetPgPassword({ token: devToken as string, password: "second-pass-789" });
    await expect(
      resetPgPassword({ token: devToken as string, password: "third-pass-000" }),
    ).rejects.toThrow(INVALID_TOKEN_MESSAGE);
  });

  it("unknown emails get the generic success (no enumeration)", async () => {
    const result = await requestPgPasswordReset({
      email: testEmail("ghost"),
      ip: testIp(),
    });
    expect(result.devToken).toBeUndefined();
  });
});

describe("pg email verification", () => {
  it("verifies with a valid token", async () => {
    const email = testEmail("verify");
    const reg = await registerPgUser({
      email,
      password: "verify-pass-123",
      fullName: "Verify User",
      role: "student",
      ip: testIp(),
    });
    expect(reg.devToken).toBeDefined();
    const user = await verifyPgEmail(reg.devToken as string);
    expect(user.email).toBe(email);
    const row = await getPool().query<{ email_verified_at: string | null }>(
      "select email_verified_at from public.users where id = $1",
      [reg.user.id],
    );
    expect(row.rows[0].email_verified_at).not.toBeNull();
  });

  it("rejects reused tokens", async () => {
    const reg = await registerPgUser({
      email: testEmail("verify-reuse"),
      password: "verify-pass-123",
      fullName: "Verify Reuse",
      role: "student",
      ip: testIp(),
    });
    await verifyPgEmail(reg.devToken as string);
    await expect(verifyPgEmail(reg.devToken as string)).rejects.toThrow(INVALID_TOKEN_MESSAGE);
  });

  it("rejects expired tokens", async () => {
    const reg = await registerPgUser({
      email: testEmail("verify-expired"),
      password: "verify-pass-123",
      fullName: "Verify Expired",
      role: "student",
      ip: testIp(),
    });
    await getPool().query(
      "update public.email_verifications set expires_at = now() - interval '1 minute' where user_id = $1",
      [reg.user.id],
    );
    await expect(verifyPgEmail(reg.devToken as string)).rejects.toThrow(INVALID_TOKEN_MESSAGE);
  });

  it("rejects invalid tokens", async () => {
    await expect(verifyPgEmail("no-such-token")).rejects.toThrow(INVALID_TOKEN_MESSAGE);
  });
});
