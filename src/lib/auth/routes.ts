/**
 * LCSS — role + redirect helpers for self-managed auth (universal).
 *
 * Pure functions (no Supabase, no database): dashboard targets, role path
 * ownership, and safe `?next=` validation. Shared by the proxy, login page,
 * and registration page so redirect behavior stays identical everywhere.
 */

export type AuthRole = "student" | "lecturer" | "admin";

/** Dashboard landing page for a role. */
export function dashboardPathForRole(role: AuthRole): string {
  switch (role) {
    case "student":
      return "/student/dashboard";
    case "lecturer":
      return "/lecturer/dashboard";
    case "admin":
      return "/admin/dashboard";
  }
}

/** Route prefix owned by a role (used for authorization + safe redirects). */
export function rolePathPrefix(role: AuthRole): string {
  switch (role) {
    case "student":
      return "/student";
    case "lecturer":
      return "/lecturer";
    case "admin":
      return "/admin";
  }
}

/**
 * Validate a `?next=` redirect target: must be a same-origin relative path
 * (blocks open redirects such as `//evil.com` or `https://…`).
 */
export function isSafeNextPath(next: string | null | undefined): next is string {
  if (!next) return false;
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\");
}

/** Does this path belong to the given role's area? */
export function isPathForRole(path: string, role: AuthRole): boolean {
  return path === rolePathPrefix(role) || path.startsWith(`${rolePathPrefix(role)}/`);
}

/** Which role owns this path, or null for public/auth pages. */
export function roleForPath(pathname: string): AuthRole | null {
  const prefixes = ["/student", "/lecturer", "/admin"] as const;
  for (const prefix of prefixes) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return prefix.slice(1) as AuthRole;
    }
  }
  return null;
}

/** True when the value is one of the three application roles. */
export function isAuthRole(value: unknown): value is AuthRole {
  return value === "student" || value === "lecturer" || value === "admin";
}
