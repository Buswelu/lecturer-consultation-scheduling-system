import { NextResponse, type NextRequest } from "next/server";
import {
  buildClearedSessionCookie,
  destroySession,
  sessionTokenFromCookieHeader,
} from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * POST /api/pg-auth/logout — invalidate the current session + clear cookie.
 * Safely succeeds when already logged out.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
  await destroySession(token);
  const res = NextResponse.json({ ok: true });
  const cleared = buildClearedSessionCookie();
  res.cookies.set(cleared.name, cleared.value, { ...cleared.options });
  return res;
}
