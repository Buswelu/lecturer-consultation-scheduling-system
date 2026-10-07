import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgAuthError, requirePgAnyRole, requirePgRole, requirePgUser } from "./require";
import { createSession } from "./session";
import { createPgAdmin, registerPgUser } from "./users";
import {
  assertTestDatabase,
  cleanupTestData,
  closeTestPool,
  setSuiteTag,
  testEmail,
  testIp,
} from "./test-helpers";

let studentToken = "";
let lecturerToken = "";
let adminToken = "";

beforeAll(async () => {
  setSuiteTag("treq");
  await assertTestDatabase();
  const student = await registerPgUser({
    email: testEmail("guard-student"),
    password: "guard-pass-123",
    fullName: "Guard Student",
    role: "student",
    ip: testIp(),
  });
  const lecturer = await registerPgUser({
    email: testEmail("guard-lecturer"),
    password: "guard-pass-123",
    fullName: "Guard Lecturer",
    role: "lecturer",
    ip: testIp(),
  });
  const admin = await createPgAdmin({
    email: testEmail("guard-admin"),
    password: "guard-pass-123",
    fullName: "Guard Admin",
  });
  studentToken = (await createSession(student.user.id)).token;
  lecturerToken = (await createSession(lecturer.user.id)).token;
  adminToken = (await createSession(admin.id)).token;
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestPool();
});

describe("pg route protection", () => {
  it("denies unauthenticated access (401)", async () => {
    await expect(requirePgUser(null)).rejects.toMatchObject({ status: 401 });
    await expect(requirePgRole(null, "student")).rejects.toMatchObject({ status: 401 });
    await expect(requirePgAnyRole(null, ["admin"])).rejects.toMatchObject({ status: 401 });
  });

  it("allows student on student routes", async () => {
    const session = await requirePgRole(studentToken, "student");
    expect(session.role).toBe("student");
  });

  it("allows lecturer on lecturer routes", async () => {
    const session = await requirePgRole(lecturerToken, "lecturer");
    expect(session.role).toBe("lecturer");
  });

  it("allows admin on admin routes", async () => {
    const session = await requirePgRole(adminToken, "admin");
    expect(session.role).toBe("admin");
  });

  it("denies wrong role (403)", async () => {
    await expect(requirePgRole(studentToken, "lecturer")).rejects.toMatchObject({ status: 403 });
    await expect(requirePgRole(lecturerToken, "admin")).rejects.toMatchObject({ status: 403 });
    await expect(requirePgAnyRole(studentToken, ["lecturer", "admin"])).rejects.toMatchObject({
      status: 403,
    });
  });

  it("requirePgAnyRole allows listed roles", async () => {
    await expect(
      requirePgAnyRole(lecturerToken, ["student", "lecturer"]),
    ).resolves.toMatchObject({ role: "lecturer" });
  });

  it("PgAuthError carries the HTTP status", () => {
    expect(new PgAuthError(401, "x").status).toBe(401);
    expect(new PgAuthError(403, "x").status).toBe(403);
  });
});
