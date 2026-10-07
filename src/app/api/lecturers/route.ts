import type { NextRequest } from "next/server";
import { listLecturersPage, parsePageParams } from "@/lib/db/repositories/people";
import { ok, pgContext, pgErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

/** GET /api/lecturers — directory visible to every authenticated role. */
export async function GET(request: NextRequest) {
  try {
    await pgContext(request);
    const params = request.nextUrl.searchParams;
    const paginated = params.has("page") || params.has("pageSize");
    const result = await listLecturersPage(
      {
        search: params.get("search") ?? undefined,
        departmentId: params.get("departmentId") ?? undefined,
        courseId: params.get("courseId") ?? undefined,
      },
      paginated ? parsePageParams(params) : undefined,
    );
    return ok({
      lecturers: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
