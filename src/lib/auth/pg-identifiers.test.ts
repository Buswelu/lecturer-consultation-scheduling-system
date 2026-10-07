import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { authRateLimitConfig } from "@/lib/security/auth-rate-limit-config";
import { checkPgRateLimit } from "./rate-limit-pg";
import {
  formatIdentifier,
  normalizeIdentifier,
  parseIdentifier,
} from "./identifiers";
import {
  GENERIC_PG_LOGIN_ERROR,
  createPgAdmin,
  loginPgUser,
  registerPgUser,
  requestPgPasswordReset,
} from "./users";
import { requirePgRole } from "./require";
import { createSession } from "./session";
import {
  assertTestDatabase,
  cleanupTestData,
  closeTestPool,
  setSuiteTag,
  testEmail,
  testIp,
} from "./test-helpers";

beforeAll(async () => {
  setSuiteTag("tids");
  await assertTestDatabase();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestPool();
});

describe("identifier formats", () => {
  it("accepts valid student / lecturer / admin formats", () => {
    expect(parseIdentifier("STU-2026-0001")).toMatchObject({
      valid: true,
      category: "student",
    });
    expect(parseIdentifier("LEC-2026-0142")).toMatchObject({
      valid: true,
      category: "lecturer",
    });
    expect(parseIdentifier("ADM-0001")).toMatchObject({
      valid: true,
      category: "admin",
    });
  });

  it("normalizes case and whitespace", () => {
    expect(parseIdentifier("  stu-2026-0001 ")).toMatchObject({
      valid: true,
      normalized: "STU-2026-0001",
      category: "student",
    });
    expect(normalizeIdentifier("lec-2026-7")).toBe("LEC-2026-7");
  });

  it("rejects ambiguous or malformed identifiers", () => {
    for (const bad of [
      "",
      "STU-26-1",
      "STU-2026-001",
      "STUD-2026-0001",
      "ADM-2026-0001",
      "LEC-0001",
      "XYZ-2026-0001",
      "STU-2026-0001 ",
    ]) {
      if (bad === "STU-2026-0001 ") continue; // trailing space normalizes away
      expect(parseIdentifier(bad).valid).toBe(false);
    }
    expect(parseIdentifier("STU-2026-0001 ").valid).toBe(true);
  });

  it("formats identifiers disjointly per category", () => {
    expect(formatIdentifier("student", 2026, 1)).toBe("STU-2026-0001");
    expect(formatIdentifier("lecturer", 2026, 42)).toBe("LEC-2026-0042");
    expect(formatIdentifier("admin", 2026, 7)).toBe("ADM-0007");
  });
});

describe("identifier registration + login", () => {
  it("assigns a student identifier and mirrors student_number", async () => {
    const reg = await registerPgUser({
      email: testEmail("idstudent"),
      password: "id-pass-123",
      fullName: "Id Student",
      role: "student",
      ip: testIp(),
    });
    expect(reg.user.username).toMatch(/^STU-\d{4}-\d{4,}$/);
    const { rows } = await getPool().query<{ student_number: string }>(
      "select student_number from public.students where profile_id = $1",
      [reg.user.id],
    );
    expect(rows[0].student_number).toBe(reg.user.username);
  });

  it("assigns a lecturer identifier and mirrors staff_number", async () => {
    const reg = await registerPgUser({
      email: testEmail("idlecturer"),
      password: "id-pass-123",
      fullName: "Id Lecturer",
      role: "lecturer",
      ip: testIp(),
    });
    expect(reg.user.username).toMatch(/^LEC-\d{4}-\d{4,}$/);
    const { rows } = await getPool().query<{ staff_number: string }>(
      "select staff_number from public.lecturers where profile_id = $1",
      [reg.user.id],
    );
    expect(rows[0].staff_number).toBe(reg.user.username);
  });

  it("identifier and email logins resolve to the same users.id", async () => {
    const email = testEmail("dual");
    const reg = await registerPgUser({
      email,
      password: "dual-pass-123",
      fullName: "Dual Login",
      role: "student",
      ip: testIp(),
    });
    const byIdentifier = await loginPgUser({
      username: reg.user.username,
      password: "dual-pass-123",
      ip: testIp(),
    });
    const byEmail = await loginPgUser({ email, password: "dual-pass-123", ip: testIp() });
    expect(byIdentifier.user.id).toBe(reg.user.id);
    expect(byEmail.user.id).toBe(reg.user.id);
    expect(byIdentifier.user.username).toBe(byEmail.user.username);
  });

  it("wrong password and unknown identifier share the generic error", async () => {
    const email = testEmail("idenum");
    const reg = await registerPgUser({
      email,
      password: "enum-pass-123",
      fullName: "Enum Check",
      role: "student",
      ip: testIp(),
    });
    const wrongPw = await loginPgUser({
      username: reg.user.username,
      password: "nope-nope-123",
      ip: testIp(),
    }).catch((e: Error) => e);
    const unknown = await loginPgUser({
      username: `STU-2099-${100000 + Math.floor(Math.random() * 899999)}`,
      password: "nope-nope-123",
      ip: testIp(),
    }).catch((e: Error) => e);
    const malformed = await loginPgUser({
      username: "not-an-identifier",
      password: "nope-nope-123",
      ip: testIp(),
    }).catch((e: Error) => e);
    expect((wrongPw as Error).message).toBe(GENERIC_PG_LOGIN_ERROR);
    expect((unknown as Error).message).toBe(GENERIC_PG_LOGIN_ERROR);
    expect((malformed as Error).message).toBe(GENERIC_PG_LOGIN_ERROR);
  });

  it("role spoofing fails: admin role request becomes student", async () => {
    const reg = await registerPgUser({
      email: testEmail("spoof"),
      password: "spoof-pass-123",
      fullName: "Spoof Attempt",
      role: "admin",
      ip: testIp(),
    });
    expect(reg.user.role).toBe("student");
    expect(reg.user.username).toMatch(/^STU-/);
  });

  it("concurrent registrations receive distinct identifiers", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        registerPgUser({
          email: testEmail(`conc-${i}`),
          password: "conc-pass-123",
          fullName: `Concurrent ${i}`,
          role: i % 2 === 0 ? "student" : "lecturer",
          ip: testIp(),
        }),
      ),
    );
    const usernames = results.map((r) => r.user.username);
    expect(new Set(usernames).size).toBe(10);
  });

  it("SQL injection in the login handle fails generically", async () => {
    for (const evil of [`' OR '1'='1`, `STU-2026-0001' --`, `'; DROP TABLE users; --`]) {
      const result = await loginPgUser({ username: evil, password: "x".repeat(10), ip: testIp() }).catch(
        (e: Error) => e,
      );
      expect((result as Error).message).toBe(GENERIC_PG_LOGIN_ERROR);
    }
    const tables = await getPool().query("select count(*) as n from public.users");
    expect(Number(tables.rows[0].n)).toBeGreaterThan(0);
  });

  it("switching between email and identifier cannot bypass rate limits", async () => {
    const email = testEmail("bypass");
    const reg = await registerPgUser({
      email,
      password: "bypass-pass-123",
      fullName: "Bypass Attempt",
      role: "student",
      ip: testIp(),
    });
    const ip = testIp();
    // 3 failures via email + 2 via identifier = 5 against the same account.
    for (let i = 0; i < 3; i++) {
      await loginPgUser({ email, password: `bad-${i}-xxxxxxxx`, ip }).catch(() => undefined);
    }
    for (let i = 0; i < 2; i++) {
      await loginPgUser({
        username: reg.user.username,
        password: `bad-${i}-xxxxxxxx`,
        ip,
      }).catch(() => undefined);
    }
    // 6th attempt via either handle is blocked by the shared account bucket.
    const blocked = await loginPgUser({
      username: reg.user.username,
      password: "bad-5-xxxxxxxx",
      ip,
    }).catch((e: Error) => e);
    expect((blocked as Error).message).toMatch(/Too many login attempts/);
    expect((blocked as { status?: number }).status).toBe(429);
    const policy = authRateLimitConfig.login;
    expect((await checkPgRateLimit(`login:user:${reg.user.id}`, policy)).allowed).toBe(false);
  });

  it("password recovery accepts an identifier and stays generic otherwise", async () => {
    const email = testEmail("idrecovery");
    const reg = await registerPgUser({
      email,
      password: "recovery-pass-123",
      fullName: "Id Recovery",
      role: "lecturer",
      ip: testIp(),
    });
    const result = await requestPgPasswordReset({ username: reg.user.username, ip: testIp() });
    expect(result.devToken).toBeDefined();
    const ghost = await requestPgPasswordReset({
      username: `LEC-2099-${100000 + Math.floor(Math.random() * 899999)}`,
      ip: testIp(),
    });
    expect(ghost.devToken).toBeUndefined();
  });
});

describe("admin identifiers + authorization", () => {
  it("provisions an admin with an ADM identifier; login works both ways", async () => {
    const admin = await createPgAdmin({
      email: testEmail("provisioned-admin"),
      password: "admin-pass-123",
      fullName: "Provisioned Admin",
    });
    expect(admin.username).toMatch(/^ADM-\d{4,}$/);
    const byIdentifier = await loginPgUser({
      username: admin.username,
      password: "admin-pass-123",
      ip: testIp(),
    });
    const byEmail = await loginPgUser({
      email: admin.email,
      password: "admin-pass-123",
      ip: testIp(),
    });
    expect(byIdentifier.user.role).toBe("admin");
    expect(byEmail.user.id).toBe(admin.id);
  });

  it("non-admin sessions are denied admin access", async () => {
    const reg = await registerPgUser({
      email: testEmail("notadmin"),
      password: "notadmin-pass-123",
      fullName: "Not Admin",
      role: "student",
      ip: testIp(),
    });
    const { token } = await createSession(reg.user.id);
    await expect(requirePgRole(token, "admin")).rejects.toMatchObject({ status: 403 });
    await expect(requirePgRole(null, "admin")).rejects.toMatchObject({ status: 401 });
  });

  it("no public identifier-enumeration endpoint exists", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const candidates = [
      "src/app/api/pg-auth/check-identifier/route.ts",
      "src/app/api/check-identifier/route.ts",
      "src/app/api/check-registration-number/route.ts",
    ];
    for (const candidate of candidates) {
      expect(fs.existsSync(path.join(process.cwd(), candidate))).toBe(false);
    }
  });
});
