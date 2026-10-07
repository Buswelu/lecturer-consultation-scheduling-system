import type { NextRequest } from "next/server";
import { getLecturer } from "@/lib/db/repositories/people";
import { ok, pgContext, pgErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

/** GET /api/lecturers/[id] — public directory profile (authenticated). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await pgContext(_request);
    const { id } = await params;
    const lecturer = await getLecturer(id);
    if (!lecturer) return pgErrorResponse(new Error("Lecturer not found."));
    return ok({ lecturer });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
