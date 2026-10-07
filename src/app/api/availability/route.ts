import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  addRule,
  exceptionsForLecturer,
  rulesForLecturer,
} from "@/lib/db/repositories/availability";
import { ok, pgContext, pgErrorResponse, readJson } from "@/lib/auth/request";

export const runtime = "nodejs";

const dayEnum = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

const createSchema = z.object({
  lecturerId: z.string().uuid().optional(),
  dayOfWeek: dayEnum,
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.number().int().positive().max(480).optional(),
});

/** GET /api/availability?lecturerId= — rules for one lecturer (authenticated). */
export async function GET(request: NextRequest) {
  try {
    await pgContext(request);
    const lecturerId = request.nextUrl.searchParams.get("lecturerId");
    if (!lecturerId) return pgErrorResponse(new Error("lecturerId is required."));
    const [rules, exceptions] = await Promise.all([
      rulesForLecturer(lecturerId),
      exceptionsForLecturer(lecturerId),
    ]);
    return ok({ rules, exceptions });
  } catch (err) {
    return pgErrorResponse(err);
  }
}

/** POST /api/availability — owning lecturer or admin. */
export async function POST(request: NextRequest) {
  try {
    const { actor } = await pgContext(request, ["lecturer", "admin"]);
    const parsed = createSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return pgErrorResponse(new Error("Please check the availability and try again."));
    }
    const lecturerId =
      actor.role === "lecturer" ? actor.lecturerId : (parsed.data.lecturerId ?? actor.lecturerId);
    if (!lecturerId) return pgErrorResponse(new Error("No lecturer selected."));
    const rule = await addRule(actor, lecturerId, parsed.data);
    return ok({ rule }, 201);
  } catch (err) {
    return pgErrorResponse(err);
  }
}
