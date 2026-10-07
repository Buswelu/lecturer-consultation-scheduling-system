import type { NextRequest } from "next/server";
import { reportsSummary } from "@/lib/db/repositories/reports";
import { ok, pgContext, pgErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

/** GET /api/admin/reports — controlled aggregates (admin only). */
export async function GET(request: NextRequest) {
  try {
    await pgContext(request, ["admin"]);
    return ok({ reports: await reportsSummary() });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
