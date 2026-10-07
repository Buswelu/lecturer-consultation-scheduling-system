/**
 * LCSS — auth rate-limit repository-shape tests (no live DB required).
 *
 * Verifies the pieces that unit tests cannot: the PostgreSQL migration is
 * present + idempotent + RLS-locked with no secret columns, the server
 * routes enforce limits BEFORE Supabase Auth, client/admin UI never touches
 * service keys or rate-limit internals, and env documentation exists.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function readRepo(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

const MIGRATION = "supabase/migrations/20260909000000_auth_rate_limits.sql";

describe("migration", () => {
  it("15. migration file exists and is idempotent (safe after db reset)", () => {
    const sql = readRepo(MIGRATION);
    expect(sql).toContain("create table if not exists public.auth_rate_limits");
    expect(sql).toContain("create index if not exists");
  });

  it("9/11. table has the required fields and no secret columns", () => {
    const sql = readRepo(MIGRATION);
    const lower = sql.toLowerCase();
    for (const col of [
      "key",
      "attempts",
      "first_attempt_at",
      "blocked_until",
      "last_attempt_at",
      "created_at",
      "updated_at",
    ]) {
      expect(lower).toContain(col);
    }
    expect(lower).toContain("unique");
    // No secret-bearing COLUMNS: inspect the CREATE TABLE column block only
    // (comments may legitimately say "never store passwords").
    const ddl = sql.slice(
      sql.toLowerCase().indexOf("create table"),
      sql.toLowerCase().indexOf(");"),
    );
    const columnLines = ddl
      .split("\n")
      .map((l) => l.trim().split(/\s+/)[0]?.toLowerCase() ?? "");
    for (const forbidden of ["password", "token", "secret"]) {
      expect(columnLines).not.toContain(forbidden);
      expect(columnLines).not.toContain(`${forbidden}_hash`);
    }
  });

  it("13. RLS is enabled with default-deny (no permissive policies)", () => {
    const sql = readRepo(MIGRATION);
    expect(sql).toContain("enable row level security");
    expect(sql.toLowerCase()).not.toMatch(/create\s+policy/);
  });

  it("bounded growth: cleanup guidance or pruning exists", () => {
    const sql = readRepo(MIGRATION);
    const store = readRepo("src/lib/security/rate-limit.ts");
    expect(sql.toLowerCase().includes("delete from") || store.includes("pruneExpired")).toBe(
      true,
    );
  });
});

describe("server enforcement order", () => {
  it("login route delegates to the server service with 429 handling", () => {
    const route = readRepo("src/app/api/pg-auth/login/route.ts");
    expect(route).toContain("loginPgUser");
    expect(route).toContain("429");
    expect(route).toContain("Retry-After");
    // Session cookie is set server-side only.
    expect(route).toContain("buildSessionCookie");
  });

  it("login service checks the limiter before password verification", () => {
    const service = readRepo("src/lib/auth/users.ts");
    const body = service.slice(service.indexOf("export async function loginPgUser"));
    const checkIdx = body.indexOf("checkPgRateLimit");
    const verifyIdx = body.indexOf("verifyPassword(");
    expect(checkIdx).toBeGreaterThanOrEqual(0);
    expect(verifyIdx).toBeGreaterThan(checkIdx);
    // Per-account + per-credential + IP dimensions enforced.
    expect(service).toContain("login:user:");
    expect(service).toContain("login:cred:");
    expect(service).toContain("login:ip:");
    // Failure/success accounting present.
    expect(service).toContain("recordPgFailure");
    expect(service).toContain("recordPgSuccess");
  });

  it("recovery + register routes have their own independent limiters", () => {
    const recovery = readRepo("src/app/api/pg-auth/forgot-password/route.ts");
    expect(recovery).toContain("requestPgPasswordReset");
    expect(recovery).toContain("429");
    const register = readRepo("src/app/api/pg-auth/register/route.ts");
    expect(register).toContain("registerPgUser");
    expect(register).toContain("429");
    // Recovery never confirms account existence.
    expect(readRepo("src/lib/auth/users.ts")).toContain("GENERIC_PG_RECOVERY_SUCCESS");
  });

  it("routes never log or store passwords/tokens/service keys", () => {
    for (const file of [
      "src/app/api/pg-auth/login/route.ts",
      "src/app/api/pg-auth/forgot-password/route.ts",
      "src/app/api/pg-auth/register/route.ts",
    ]) {
      const src = readRepo(file);
      expect(src).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(src).not.toContain("service_role");
    }
    // No hardcoded secret VALUES anywhere in auth code (env NAME reads via
    // process.env.* in server-only code are the legitimate mechanism).
    for (const file of [
      "src/app/api/pg-auth/login/route.ts",
      "src/app/api/pg-auth/forgot-password/route.ts",
      "src/app/api/pg-auth/register/route.ts",
      "src/lib/auth/rate-limit-pg.ts",
      "src/lib/auth/users.ts",
      "src/lib/security/auth-log.ts",
    ]) {
      const src = readRepo(file);
      expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // no JWT literals
      expect(src).not.toMatch(/sb_secret_[A-Za-z0-9_-]+/);
      // No `console.log(password…)` style leaks.
      for (const line of src.split("\n")) {
        if (/console\.(log|info|warn|error)/.test(line)) {
          expect(line.toLowerCase()).not.toContain("password");
        }
      }
    }
  });

  it("login failures use the generic message (no existence oracle)", () => {
    const service = readRepo("src/lib/auth/users.ts").toLowerCase();
    expect(service).not.toContain("user does not exist");
    expect(service).not.toContain("incorrect password");
    expect(service).toContain("generic");
  });
});

describe("UI + admin secrecy", () => {
  it("14. auth pages and admin UI never import the store or service keys", () => {
    const uiFiles = [
      "src/app/login/page.tsx",
      "src/app/register/page.tsx",
      "src/app/forgot-password/page.tsx",
      "src/app/reset-password/page.tsx",
      "src/app/admin/users/page.tsx",
      "src/app/admin/settings/page.tsx",
    ];
    for (const file of uiFiles) {
      const src = readRepo(file);
      expect(src).not.toContain("rate-limit-store");
      expect(src).not.toContain("PostgresRateLimitStore");
      expect(src).not.toContain("MemoryRateLimitStore");
      expect(src).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(src).not.toContain("service_role");
      expect(src).not.toContain("createServiceClient");
    }
  });

  it("16. login UI disables submission while processing and shows countdown state", () => {
    const src = readRepo("src/app/login/page.tsx");
    expect(src).toContain("disabled={loading}");
    expect(src).toContain("retryAfter");
    // Stage 4 cutover: the login form authenticates via the self-managed
    // PostgreSQL browser abstraction, never Supabase Auth directly.
    expect(src).toContain("pgLogin");
    expect(src).toContain("@/lib/auth/client");
    expect(src).not.toContain("/api/auth/login");
    expect(src).not.toContain("supabase/auth");
    // The abstraction itself targets the PostgreSQL endpoint.
    expect(readRepo("src/lib/auth/client.ts")).toContain("/api/pg-auth/login");
  });

  it("no client auth helper bypasses the server (direct sign-in removed from login)", () => {
    const login = readRepo("src/app/login/page.tsx");
    expect(login).not.toMatch(/await signIn\(/);
  });
});

describe("env documentation", () => {
  it(".env.example documents every required variable with defaults", () => {
    const env = readRepo(".env.example");
    for (const name of [
      "AUTH_LOGIN_MAX_ATTEMPTS",
      "AUTH_LOGIN_WINDOW_SECONDS",
      "AUTH_LOGIN_LOCKOUT_SECONDS",
      "AUTH_RECOVERY_MAX_ATTEMPTS",
      "AUTH_RECOVERY_WINDOW_SECONDS",
      "AUTH_REGISTER_MAX_ATTEMPTS",
      "AUTH_REGISTER_WINDOW_SECONDS",
    ]) {
      expect(env).toContain(name);
    }
    // No Supabase configuration remains required.
    expect(env).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(env).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(env).toContain("DATABASE_URL");
    expect(env).toContain("SESSION_SECRET");
  });

  it("no secrets committed (.env.local stays git-ignored)", () => {
    const gitignore = readRepo(".gitignore");
    expect(gitignore).toContain(".env*");
  });
});
