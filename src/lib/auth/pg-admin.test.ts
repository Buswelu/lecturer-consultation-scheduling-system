import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { createSession } from "./session";
import { SESSION_COOKIE_NAME } from "./config";
import { createPgAdmin, loginPgUser, registerPgUser } from "./users";
import { GET as listUsers, PATCH as patchUser } from "@/app/api/admin/users/route";
import { GET as overview } from "@/app/api/admin/overview/route";
import { GET as adminReports } from "@/app/api/admin/reports/route";
import {
  assertTestDatabase,
  cleanupTestData,
  closeTestPool,
  setSuiteTag,
  testEmail,
  testIp,
} from "./test-helpers";

let adminToken = "";
let adminId = "";
let studentToken = "";
let studentId = "";

function requestWithCookie(url: string, token: string | null, init?: RequestInit): NextRequest {
  // NOTE: `new NextRequest()` mangles cookie headers under Vitest (Next 16
  // edge-runtime cookie handling), so tests call handlers with a minimal
  // stub exposing exactly what the handlers use (headers/nextUrl/json).
  // Live HTTP smoke tests separately prove real Next plumbing end to end.
  const headers = new Headers();
  if (token) headers.set("cookie", `${SESSION_COOKIE_NAME}=${token}`);
  const stub = {
    headers,
    nextUrl: new URL(url),
    json: async () =>
      JSON.parse(
        typeof init?.body === "string" ? (init.body as string) : "null",
      ),
  };
  return stub as unknown as NextRequest;
}

beforeAll(async () => {
  setSuiteTag("tadm");
  await assertTestDatabase();
  const admin = await createPgAdmin({
    email: testEmail("route-admin"),
    password: "route-admin-pass-123",
    fullName: "Route Admin",
  });
  const student = await registerPgUser({
    email: testEmail("route-student"),
    password: "route-student-pass-123",
    fullName: "Route Student",
    role: "student",
    ip: testIp(),
  });
  studentId = student.user.id;
  adminId = admin.id;
  adminToken = (await createSession(admin.id)).token;
  studentToken = (await createSession(student.user.id)).token;
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestPool();
});

describe("admin APIs", () => {
  it("overview requires admin (401 anon, 403 student)", async () => {
    expect(
      (await overview(requestWithCookie("http://x/api/admin/overview", null))).status,
    ).toBe(401);
    expect(
      (await overview(requestWithCookie("http://x/api/admin/overview", studentToken))).status,
    ).toBe(403);
    const res = await overview(requestWithCookie("http://x/api/admin/overview", adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      tables: Record<string, number>;
      usersByRole: Record<string, number>;
      usersActive: number;
      appointmentsByStatus: Record<string, number>;
      availability: { lecturersWithAvailability: number };
      notifications: { total: number; unread: number };
      activeSessions: number;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.tables.users).toBe("number");
    expect(typeof body.usersActive).toBe("number");
    expect(typeof body.activeSessions).toBe("number");
    expect(typeof body.notifications.total).toBe("number");
  });

  it("users directory exposes safe fields only", async () => {
    const res = await listUsers(requestWithCookie("http://x/api/admin/users", adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; users: Record<string, unknown>[] };
    expect(body.ok).toBe(true);
    expect(body.users.length).toBeGreaterThan(0);
    for (const u of body.users) {
      expect(u).toHaveProperty("username");
      expect(u).toHaveProperty("is_active");
      expect(u).not.toHaveProperty("password_hash");
      expect(u).not.toHaveProperty("token_hash");
      expect(u).not.toHaveProperty("password");
    }
    expect(
      (await listUsers(requestWithCookie("http://x/api/admin/users", studentToken))).status,
    ).toBe(403);
    expect(
      (await listUsers(requestWithCookie("http://x/api/admin/users", null))).status,
    ).toBe(401);
  });

  it("reports endpoint returns server-computed aggregates", async () => {
    const res = await adminReports(requestWithCookie("http://x/api/admin/reports", adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reports: {
        appointmentsByStatus: Record<string, number>;
        appointmentsByType: { inPerson: number; online: number };
        appointmentsByMonth: { month: string; count: number }[];
        topCourses: { courseId: string; courseName: string; count: number }[];
        totals: { appointments: number };
      };
    };
    expect(typeof body.reports.totals.appointments).toBe("number");
    expect(typeof body.reports.appointmentsByType.inPerson).toBe("number");
    expect(Array.isArray(body.reports.appointmentsByMonth)).toBe(true);
    expect(Array.isArray(body.reports.topCourses)).toBe(true);
    const denied = await adminReports(
      requestWithCookie("http://x/api/admin/reports", studentToken),
    );
    expect(denied.status).toBe(403);
  });

  it("deactivate blocks login; reactivate restores it", async () => {
    const email = testEmail("toggle");
    const reg = await registerPgUser({
      email,
      password: "toggle-pass-123",
      fullName: "Toggle User",
      role: "student",
      ip: testIp(),
    });
    const off = await patchUser(
      requestWithCookie("http://x/api/admin/users", adminToken, {
        method: "PATCH",
        body: JSON.stringify({ userId: reg.user.id, isActive: false }),
      }),
    );
    expect(off.status).toBe(200);
    await expect(
      loginPgUser({ email, password: "toggle-pass-123", ip: testIp() }),
    ).rejects.toThrow();
    const on = await patchUser(
      requestWithCookie("http://x/api/admin/users", adminToken, {
        method: "PATCH",
        body: JSON.stringify({ userId: reg.user.id, isActive: true }),
      }),
    );
    expect(on.status).toBe(200);
    const back = await loginPgUser({ email, password: "toggle-pass-123", ip: testIp() });
    expect(back.user.id).toBe(reg.user.id);
    void studentId;
  });

  it("rejects self-deactivation and malformed bodies", async () => {
    const selfOff = await patchUser(
      requestWithCookie("http://x/api/admin/users", adminToken, {
        method: "PATCH",
        body: JSON.stringify({ userId: adminId, isActive: false }),
      }),
    );
    expect(selfOff.status).toBe(400);
    const bad = await patchUser(
      requestWithCookie("http://x/api/admin/users", adminToken, {
        method: "PATCH",
        body: JSON.stringify({ nope: true }),
      }),
    );
    expect(bad.status).toBe(400);
    const studentPatch = await patchUser(
      requestWithCookie("http://x/api/admin/users", studentToken, {
        method: "PATCH",
        body: JSON.stringify({ userId: "00000000-0000-0000-0000-000000000000", isActive: false }),
      }),
    );
    expect(studentPatch.status).toBe(403);
  });

  it("no arbitrary-SQL endpoint exists in the API surface", () => {
    const apiDir = join(process.cwd(), "src", "app", "api");
    const routeFiles: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "route.ts") routeFiles.push(full);
      }
    };
    walk(apiDir);
    expect(routeFiles.length).toBeGreaterThan(0);
    for (const file of routeFiles) {
      const src = readFileSync(file, "utf8");
      // No raw SQL execution of request-controlled text, no shell, no secrets.
      expect(src).not.toMatch(/exec\s*\(|child_process|DATABASE_URL|SESSION_SECRET/);
    }
  });
});
