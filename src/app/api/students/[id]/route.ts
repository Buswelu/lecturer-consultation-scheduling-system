import type { NextRequest } from "next/server";
import { getStudent } from "@/lib/db/repositories/people";
import { ok, pgContext, pgErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

/**
 * GET /api/students/[id] — owner, counterparty lecturer (shared
 * appointment), or admin. Everyone else gets 403 (never existence-oracle:
 * unknown ids are 404 only when visible... unknown ids 404, hidden 403).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await pgContext(_request);
    const { id } = await params;
    const student = await getStudent(actor, id);
    if (!student) return pgErrorResponse(new Error("Student not found."));
    return ok({ student });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
