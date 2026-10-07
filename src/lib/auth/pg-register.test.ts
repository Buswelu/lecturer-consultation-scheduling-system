import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { GENERIC_PG_REGISTER_ERROR, registerPgUser } from "./users";
import {
  assertTestDatabase,
  cleanupTestData,
  closeTestPool,
  setSuiteTag,
  testEmail,
  testIp,
} from "./test-helpers";

beforeAll(async () => {
  setSuiteTag("treg");
  await assertTestDatabase();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestPool();
});

describe("pg registration", () => {
  it("registers a valid student with profile + detail rows", async () => {
    const email = testEmail("student");
    const result = await registerPgUser({
      email,
      password: "student-pass-123",
      fullName: "Test Student",
      role: "student",
      ip: testIp(),
    });
    expect(result.user.role).toBe("student");
    expect(result.needsVerification).toBe(true);

    const { rows } = await getPool().query(
      `select u.email, p.role, p.full_name, s.id as student_id, l.id as lecturer_id
         from public.users u
         join public.profiles p on p.id = u.id
         left join public.students s on s.profile_id = u.id
         left join public.lecturers l on l.profile_id = u.id
        where u.id = $1`,
      [result.user.id],
    );
    expect(rows[0].role).toBe("student");
    expect(rows[0].student_id).not.toBeNull();
    expect(rows[0].lecturer_id).toBeNull();

    // Password stored as Argon2id hash only.
    const pw = await getPool().query<{ password_hash: string }>(
      "select password_hash from public.users where id = $1",
      [result.user.id],
    );
    expect(pw.rows[0].password_hash.startsWith("$argon2id$")).toBe(true);
  });

  it("registers a valid lecturer", async () => {
    const email = testEmail("lecturer");
    const result = await registerPgUser({
      email,
      password: "lecturer-pass-123",
      fullName: "Test Lecturer",
      role: "lecturer",
      ip: testIp(),
    });
    expect(result.user.role).toBe("lecturer");
    const { rows } = await getPool().query(
      "select id from public.lecturers where profile_id = $1",
      [result.user.id],
    );
    expect(rows.length).toBe(1);
  });

  it("rejects duplicate email with a generic error (no enumeration)", async () => {
    const email = testEmail("duplicate");
    await registerPgUser({
      email,
      password: "first-pass-123",
      fullName: "First User",
      role: "student",
      ip: testIp(),
    });
    await expect(
      registerPgUser({
        email,
        password: "second-pass-123",
        fullName: "Second User",
        role: "student",
        ip: testIp(),
      }),
    ).rejects.toThrow(GENERIC_PG_REGISTER_ERROR);

    // No orphan rows: exactly one user, profile, and verification row.
    const users = await getPool().query("select id from public.users where email = $1", [email]);
    expect(users.rows.length).toBe(1);
    const verifications = await getPool().query(
      "select id from public.email_verifications where user_id = $1",
      [users.rows[0].id],
    );
    expect(verifications.rows.length).toBe(1);
  });

  it("rejects invalid email", async () => {
    await expect(
      registerPgUser({
        email: "not-an-email",
        password: "valid-pass-123",
        fullName: "Bad Email",
        role: "student",
        ip: testIp(),
      }),
    ).rejects.toThrow();
  });

  it("rejects weak password", async () => {
    await expect(
      registerPgUser({
        email: testEmail("weak"),
        password: "12345",
        fullName: "Weak Password",
        role: "student",
        ip: testIp(),
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid role input", async () => {
    // sanitizePublicRole coerces unknown roles to student — admin never granted.
    const result = await registerPgUser({
      email: testEmail("role"),
      password: "valid-pass-123",
      fullName: "Role Test",
      role: "admin",
      ip: testIp(),
    });
    expect(result.user.role).toBe("student");
  });

  it("database enforces unique email even on direct insert", async () => {
    const email = testEmail("dbunique");
    await getPool().query(
      "insert into public.users (email, username, password_hash) values ($1, 'ADM-9001', 'x')",
      [email],
    );
    await expect(
      getPool().query(
        "insert into public.users (email, username, password_hash) values ($1, 'ADM-9002', 'x')",
        [email],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
