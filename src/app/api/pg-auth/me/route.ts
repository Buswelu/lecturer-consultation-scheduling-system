import { NextResponse, type NextRequest } from "next/server";
import { queryOne } from "@/lib/db/query";
import { getSessionUser, sessionTokenFromCookieHeader } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * GET /api/pg-auth/me — current session identity (safe fields only).
 * Never returns password hashes, tokens, or security internals.
 * Includes the caller's students/lecturers row id (if any) so the frontend
 * can resolve entity-scoped data without a second round-trip.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
  const session = await getSessionUser(token);
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const [student, lecturer] = await Promise.all([
    queryOne<{ id: string }>("select id from public.students where profile_id = $1", [
      session.userId,
    ]).catch(() => null),
    queryOne<{ id: string }>("select id from public.lecturers where profile_id = $1", [
      session.userId,
    ]).catch(() => null),
  ]);
  return NextResponse.json({
    id: session.userId,
    email: session.email,
    username: session.username,
    role: session.role,
    fullName: session.fullName,
    studentId: student?.id ?? null,
    lecturerId: lecturer?.id ?? null,
  });
}
