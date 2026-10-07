import { NextResponse, type NextRequest } from "next/server";
import { PgAuthError, requirePgRole } from "@/lib/auth/require";
import { sessionTokenFromCookieHeader } from "@/lib/auth/session";
import { setPgUserActive } from "@/lib/auth/users";
import { adminDirectory } from "@/lib/db/repositories/people";
import { parsePageParams } from "@/lib/db/repositories/people";
import { z } from "zod";

export const runtime = "nodejs";

async function requireAdmin(request: NextRequest) {
  const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
  try {
    return await requirePgRole(token, "admin");
  } catch (err) {
    const status = err instanceof PgAuthError ? err.status : 401;
    return NextResponse.json({ error: "Not authorized." }, { status });
  }
}

/**
 * GET /api/admin/users — controlled user directory for administrators.
 * Safe fields only: never password hashes, tokens, or secrets.
 * Supports ?search=&role=&departmentId=&status=&page=&pageSize=.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const params = request.nextUrl.searchParams;
  const page = parsePageParams(params);
  const paginated = params.has("page") || params.has("pageSize");
  const result = await adminDirectory(
    {
      profileId: admin.userId,
      role: "admin",
      studentId: null,
      lecturerId: null,
    },
    {
      search: params.get("search") ?? undefined,
      role: params.get("role") ?? undefined,
      departmentId: params.get("departmentId") ?? undefined,
      status: params.get("status") ?? undefined,
    },
    paginated ? page : undefined,
  );
  return NextResponse.json({
    ok: true,
    users: result.items.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      full_name: u.fullName,
      role: u.role,
      is_active: u.isActive,
      created_at: u.createdAt,
      last_login_at: u.lastLoginAt,
      entity_id: u.entityId,
      department_id: u.departmentId ?? null,
      department_name: u.departmentName ?? null,
      status: u.isActive ? "active" : "inactive",
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
}

const patchSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

/**
 * PATCH /api/admin/users — activate/deactivate an account.
 * Deactivation also revokes all sessions. Admins cannot deactivate
 * themselves (prevents instant self-lockout).
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (parsed.data.userId === admin.userId) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account." },
      { status: 400 },
    );
  }
  await setPgUserActive(parsed.data.userId, parsed.data.isActive);
  return NextResponse.json({ ok: true });
}
