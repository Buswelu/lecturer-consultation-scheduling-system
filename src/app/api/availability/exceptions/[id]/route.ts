import type { NextRequest } from "next/server";
import { deleteException } from "@/lib/db/repositories/availability";
import { ok, pgContext, pgErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

/** DELETE /api/availability/exceptions/[id]?lecturerId= — owning lecturer or admin. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await pgContext(request, ["lecturer", "admin"]);
    const { id } = await params;
    const lecturerId =
      actor.role === "lecturer"
        ? actor.lecturerId
        : (request.nextUrl.searchParams.get("lecturerId") ?? actor.lecturerId);
    if (!lecturerId) return pgErrorResponse(new Error("No lecturer selected."));
    await deleteException(actor, id, lecturerId);
    return ok({ ok: true });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
