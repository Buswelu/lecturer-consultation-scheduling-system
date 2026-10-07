import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextRequest, NextResponse } from "next/server";
import { proxy } from "@/proxy";
import { SESSION_COOKIE_NAME } from "./config";
import { createSession, destroySession } from "./session";
import { createPgAdmin, loginPgUser, registerPgUser } from "./users";
import {
  assertTestDatabase,
  cleanupTestData,
  closeTestPool,
  setSuiteTag,
  testEmail,
  testIp,
} from "./test-helpers";

function proxyRequest(path: string, token: string | null): NextRequest {
  const headers = new Headers();
  if (token) headers.set("cookie", `${SESSION_COOKIE_NAME}=${token}`);
  // The proxy only touches nextUrl / headers.get("cookie").
  return {
    headers,
    nextUrl: new URL(`http://x${path}`),
    url: `http://x${path}`,
  } as unknown as NextRequest;
}

function locationOf(res: NextResponse): string | null {
  return res.headers.get("location");
}

let studentToken = "";

beforeAll(async () => {
  setSuiteTag("tproxy");
  await assertTestDatabase();
  const student = await registerPgUser({
    email: testEmail("proxy-student"),
    password: "proxy-pass-123",
    fullName: "Proxy Student",
    role: "student",
    ip: testIp(),
  });
  studentToken = (await createSession(student.user.id)).token;
  // An admin exists for wrong-role coverage without extra sessions here.
  await createPgAdmin({
    email: testEmail("proxy-admin"),
    password: "proxy-admin-pass-123",
    fullName: "Proxy Admin",
  });
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestPool();
});

describe("auth-page accessibility (hotfix)", () => {
  it("anonymous /login renders without redirect", async () => {
    const res = await proxy(proxyRequest("/login", null));
    expect(res.status).toBe(200);
    expect(locationOf(res)).toBeNull();
  });

  it("anonymous /register and /forgot-password render without redirect", async () => {
    for (const path of ["/register", "/forgot-password", "/reset-password"]) {
      const res = await proxy(proxyRequest(path, null));
      expect(res.status).toBe(200);
      expect(locationOf(res)).toBeNull();
    }
  });

  it("invalid/stale session cookies are treated as anonymous", async () => {
    for (const path of ["/login", "/register"]) {
      const res = await proxy(proxyRequest(path, "stale-or-forged-token"));
      expect(res.status).toBe(200);
      expect(locationOf(res)).toBeNull();
    }
  });

  it("anonymous protected routes redirect to /login with next", async () => {
    const res = await proxy(proxyRequest("/student/appointments", null));
    expect(res.status).toBe(307);
    const location = locationOf(res);
    expect(location).toContain("/login");
    expect(location).toContain(encodeURIComponent("/student/appointments"));
  });

  it("authenticated student bounces from /login to their dashboard", async () => {
    const res = await proxy(proxyRequest("/login?next=/student/calendar", studentToken));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toContain("/student/calendar");
  });

  it("wrong-role access redirects to the caller's dashboard", async () => {
    const res = await proxy(proxyRequest("/admin/dashboard", studentToken));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toContain("/student/dashboard");
  });

  it("correct-role access passes through", async () => {
    const res = await proxy(proxyRequest("/student/calendar", studentToken));
    expect(res.status).toBe(200);
  });

  it("after logout the session is gone and /login is public again", async () => {
    const email = testEmail("proxy-logout");
    await registerPgUser({
      email,
      password: "proxy-logout-123",
      fullName: "Proxy Logout",
      role: "student",
      ip: testIp(),
    });
    const login = await loginPgUser({ email, password: "proxy-logout-123", ip: testIp() });
    expect(
      (await proxy(proxyRequest("/login", login.token))).status,
    ).toBe(307);
    await destroySession(login.token);
    const res = await proxy(proxyRequest("/login", login.token));
    expect(res.status).toBe(200);
    expect(locationOf(res)).toBeNull();
  });
});

describe("auth pages never navigate without authentication (hotfix)", () => {
  function src(relative: string): string {
    return readFileSync(join(process.cwd(), relative), "utf8");
  }

  it("login page has no mock/demo navigation paths", () => {
    const page = src("src/app/login/page.tsx");
    expect(page).not.toContain("Legacy mock preview");
    expect(page).not.toContain("Demo login as");
    expect(page).not.toContain("isSupabaseConfigured");
    // The only dashboard navigation follows a successful pgLogin.
    expect(page).toContain("pgLogin");
  });

  it("register page has no mock navigation paths", () => {
    const page = src("src/app/register/page.tsx");
    expect(page).not.toContain("Legacy mock preview");
    expect(page).not.toContain("isSupabaseConfigured");
    expect(page).toContain("pgRegister");
  });

  it("current-user hook exposes a distinct loading state", () => {
    const client = src("src/lib/auth/client.ts");
    expect(client).toContain("loading");
    expect(client).toContain("cache: \"no-store\"");
    expect(client).toContain("getPgCurrentUser");
  });
});
