import type { NextRequest } from "next/server";
import { z } from "zod";
import { assignCourse, unassignCourse } from "@/lib/db/repositories/academic";
import { ok, pgContext, pgErrorResponse, readJson } from "@/lib/auth/request";

export const runtime = "nodejs";

const assignSchema = z.object({ lecturerId: z.string().uuid().optional() });

/** POST /api/courses/[id]/assign — self-assign (lecturer) or assign anyone (admin). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await pgContext(request, ["lecturer", "admin"]);
    const { id } = await params;
    const parsed = assignSchema.safeParse(await readJson(request));
    if (!parsed.success) return pgErrorResponse(new Error("Invalid request."));
    const lecturerId =
      actor.role === "lecturer" ? actor.lecturerId : (parsed.data.lecturerId ?? actor.lecturerId);
    if (!lecturerId) return pgErrorResponse(new Error("No lecturer to assign."));
    await assignCourse(actor, id, lecturerId);
    return ok({ ok: true });
  } catch (err) {
    return pgErrorResponse(err);
  }
}

/** DELETE /api/courses/[id]/assign — self-unassign (lecturer) or unassign anyone (admin). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await pgContext(request, ["lecturer", "admin"]);
    const { id } = await params;
    const lecturerId =
      actor.role === "lecturer"
        ? actor.lecturerId
        : (request.nextUrl.searchParams.get("lecturerId") ?? actor.lecturerId);
    if (!lecturerId) return pgErrorResponse(new Error("No lecturer to unassign."));
    await unassignCourse(actor, id, lecturerId);
    return ok({ ok: true });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
