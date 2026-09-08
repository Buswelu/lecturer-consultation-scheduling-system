import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  dashboardPathForRole,
  isPathForRole,
  isSafeNextPath,
} from "./auth";
import type { DbRole } from "./database.types";

/**
 * Refreshes the Supabase auth session on every request so server-side
 * session state never goes stale. Must be called from the root `proxy.ts`.
 *
 * No-op (plain `NextResponse.next()`) when Supabase env vars are missing so
 * the app keeps working on mock data without any configuration.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refreshes the session cookie when expired; also surfaces auth errors.
  await supabase.auth.getUser();

  return supabaseResponse;
}

const ROLE_PREFIXES = ["/student", "/lecturer", "/admin"] as const;

/** Which role owns this path, or null for public/auth pages. */
function roleForPath(pathname: string): DbRole | null {
  for (const prefix of ROLE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return prefix.slice(1) as DbRole;
    }
  }
  return null;
}

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

/**
 * Session refresh + route protection + role authorization in a single pass.
 *
 * - `/student/*`, `/lecturer/*`, `/admin/*` require a session; otherwise the
 *   user is sent to `/login?next=<path>`.
 * - The role comes from `public.profiles` (never client input). A user on
 *   another role's area is redirected to their own dashboard.
 * - Signed-in users visiting auth pages bounce to their dashboard.
 * - No-op when Supabase is unconfigured (mock preview mode).
 */
export async function handleMiddleware(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  let response = NextResponse.next({ request });
  if (!url || !anonKey) {
    return response;
  }

  // Cookies refreshed during getUser() — re-applied to redirects below.
  const refreshed: { name: string; value: string; options: CookieOptions }[] = [];
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        refreshed.push(...cookiesToSet);
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const redirect = (dest: URL): NextResponse => {
    const res = NextResponse.redirect(dest);
    refreshed.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options),
    );
    return res;
  };

  const { data } = await supabase.auth.getUser();
  const user = data.user ?? null;
  const pathname = request.nextUrl.pathname;
  const requiredRole = roleForPath(pathname);

  if (!user) {
    if (requiredRole) {
      const loginUrl = new URL("/login", request.url);
      const attempted = `${pathname}${request.nextUrl.search}`;
      if (isSafeNextPath(attempted)) {
        loginUrl.searchParams.set("next", attempted);
      }
      return redirect(loginUrl);
    }
    return response;
  }

  // Trusted role lookup (RLS `profiles_select_own` permits self-read).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile) {
    // Authenticated but no profile row (e.g. mid-signup): send to login,
    // which self-heals via ensureUserProfile().
    if (requiredRole) {
      return redirect(new URL("/login", request.url));
    }
    return response;
  }
  const role = profile.role;

  if (requiredRole) {
    if (requiredRole !== role || !isPathForRole(pathname, role)) {
      return redirect(new URL(dashboardPathForRole(role), request.url));
    }
    return response;
  }

  if (AUTH_PAGES.includes(pathname)) {
    return redirect(new URL(dashboardPathForRole(role), request.url));
  }

  return response;
}
