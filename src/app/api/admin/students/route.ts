import type { NextRequest } from "next/server";
import { listStudents } from "@/lib/db/repositories/people";
import { ok, pgContext, pgErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

/** GET /api/admin/students — full directory (admin only). */
export async function GET(request: NextRequest) {
  try {
    const { actor } = await pgContext(request, ["admin"]);
    const params = request.nextUrl.searchParams;
    const students = await listStudents(actor, {
      search: params.get("search") ?? undefined,
      departmentId: params.get("departmentId") ?? undefined,
    });
    return ok({ students });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
