import type { NextRequest } from "next/server";
import { z } from "zod";
import { addException } from "@/lib/db/repositories/availability";
import { ok, pgContext, pgErrorResponse, readJson } from "@/lib/auth/request";

export const runtime = "nodejs";

const createSchema = z.object({
  lecturerId: z.string().uuid().optional(),
  startDatetime: z.string().min(10),
  endDatetime: z.string().min(10),
  reason: z.string().trim().max(200).optional(),
});

/** POST /api/availability/exceptions — owning lecturer or admin. */
export async function POST(request: NextRequest) {
  try {
    const { actor } = await pgContext(request, ["lecturer", "admin"]);
    const parsed = createSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return pgErrorResponse(new Error("Please check the exception and try again."));
    }
    const lecturerId =
      actor.role === "lecturer" ? actor.lecturerId : (parsed.data.lecturerId ?? actor.lecturerId);
    if (!lecturerId) return pgErrorResponse(new Error("No lecturer selected."));
    const exception = await addException(actor, lecturerId, {
      startDatetime: parsed.data.startDatetime,
      endDatetime: parsed.data.endDatetime,
      reason: parsed.data.reason,
    });
    return ok({ exception }, 201);
  } catch (err) {
    return pgErrorResponse(err);
  }
}
