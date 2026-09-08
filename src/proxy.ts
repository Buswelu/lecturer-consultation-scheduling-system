import type { NextRequest } from "next/server";
import { handleMiddleware } from "@/lib/supabase/middleware";

/**
 * Root proxy (Next.js 16 renamed Middleware → Proxy).
 *
 * Supabase session refresh + route protection:
 * - `/student/*`, `/lecturer/*`, `/admin/*` require an authenticated session;
 *   otherwise redirect to `/login?next=<path>`.
 * - Role is resolved server-side from `public.profiles`; users on another
 *   role's area are redirected to their own dashboard.
 * - Signed-in users visiting auth pages bounce to their dashboard.
 * - No-op when Supabase env vars are missing (mock preview mode).
 */
export async function proxy(request: NextRequest) {
  return handleMiddleware(request);
}

export const config = {
  matcher: [
    /*
     * Run on all routes except static assets and Next internals.
     * Auth pages are included so refreshed sessions propagate everywhere.
     */
    "/((?!_next/static|_next/image|favicon.ico|avatars|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
