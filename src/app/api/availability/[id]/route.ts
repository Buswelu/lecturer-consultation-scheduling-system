import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteRule, updateRule } from "@/lib/db/repositories/availability";
import { ok, pgContext, pgErrorResponse, readJson } from "@/lib/auth/request";

export const runtime = "nodejs";

const patchSchema = z.object({
  lecturerId: z.string().uuid().optional(),
  dayOfWeek: z
    .enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
    .optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  duration: z.number().int().positive().max(480).optional(),
});

/** PATCH /api/availability/[id] — owning lecturer or admin. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await pgContext(request, ["lecturer", "admin"]);
    const { id } = await params;
    const parsed = patchSchema.safeParse(await readJson(request));
    if (!parsed.success || !parsed.data.dayOfWeek || !parsed.data.startTime || !parsed.data.endTime) {
      return pgErrorResponse(new Error("Please check the availability and try again."));
    }
    const lecturerId =
      actor.role === "lecturer" ? actor.lecturerId : (parsed.data.lecturerId ?? actor.lecturerId);
    if (!lecturerId) return pgErrorResponse(new Error("No lecturer selected."));
    const rule = await updateRule(actor, id, lecturerId, {
      dayOfWeek: parsed.data.dayOfWeek,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      duration: parsed.data.duration,
    });
    return ok({ rule });
  } catch (err) {
    return pgErrorResponse(err);
  }
}

/** DELETE /api/availability/[id]?lecturerId= — owning lecturer or admin. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await pgContext(request, ["lecturer", "admin"]);
    const { id } = await params;
    const lecturerId =
      actor.role === "lecturer"
        ? actor.lecturerId
        : (request.nextUrl.searchParams.get("lecturerId") ?? actor.lecturerId);
    if (!lecturerId) return pgErrorResponse(new Error("No lecturer selected."));
    await deleteRule(actor, id, lecturerId);
    return ok({ ok: true });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
