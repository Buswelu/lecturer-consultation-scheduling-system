import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, sessionTokenFromCookieHeader } from "@/lib/auth/session";
import {
  dashboardPathForRole,
  isPathForRole,
  isSafeNextPath,
  roleForPath,
} from "@/lib/auth/routes";

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

/**
 * Root proxy (Next.js 16 renamed Middleware → Proxy).
 *
 * Self-managed PostgreSQL session + route protection:
 * - `/student/*`, `/lecturer/*`, `/admin/*` require a valid `lcss_session`
 *   cookie; otherwise redirect to `/login?next=<path>`.
 * - Role is resolved server-side from `public.profiles` (never client input);
 *   users on another role's area are redirected to their own dashboard.
 * - Signed-in users visiting auth pages bounce to their dashboard.
 *
 * PostgreSQL-only: no Supabase or mock session handling remains anywhere
 * in the request path (retired in Stage 7).
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requiredRole = roleForPath(pathname);

  const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
  const session = await getSessionUser(token).catch(() => null);

  if (!session) {
    if (requiredRole) {
      const loginUrl = new URL("/login", request.url);
      const attempted = `${pathname}${request.nextUrl.search}`;
      if (isSafeNextPath(attempted)) {
        loginUrl.searchParams.set("next", attempted);
      }
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next({ request });
  }

  const role = session.role;

  if (requiredRole) {
    if (requiredRole !== role || !isPathForRole(pathname, role)) {
      return NextResponse.redirect(new URL(dashboardPathForRole(role), request.url));
    }
    return NextResponse.next({ request });
  }

  if (AUTH_PAGES.includes(pathname)) {
    // Already signed in: honor a safe same-role `next` target (mirrors the
    // login form's own bounce), otherwise land on the role dashboard.
    const next = request.nextUrl.searchParams.get("next");
    const dest =
      next && isSafeNextPath(next) && isPathForRole(next, role)
        ? next
        : dashboardPathForRole(role);
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    /*
     * Run on all routes except static assets and Next internals.
     * Auth pages are included so signed-in users bounce to dashboards.
     */
    "/((?!_next/static|_next/image|favicon.ico|avatars|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
