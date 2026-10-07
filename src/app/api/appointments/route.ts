import type { NextRequest } from "next/server";
import { z } from "zod";
import { createAppointmentAs, listAppointmentsPage } from "@/lib/db/repositories/appointments";
import { parsePageParams } from "@/lib/db/repositories/people";
import { ok, pgContext, pgErrorResponse, readJson } from "@/lib/auth/request";

export const runtime = "nodejs";

const statusEnum = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "completed",
  "rescheduled",
  "no-show",
]);

const createSchema = z.object({
  studentId: z.string().uuid().optional(),
  lecturerId: z.string().uuid(),
  courseId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  type: z.enum(["in-person", "online"]),
  reason: z.string().trim().min(5).max(2000),
  notes: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(500).optional(),
});

/** GET /api/appointments — scoped: own for student/lecturer, all for admin. */
export async function GET(request: NextRequest) {
  try {
    const { actor } = await pgContext(request);
    const params = request.nextUrl.searchParams;
    const statusRaw = params.get("status");
    const status = statusRaw ? statusEnum.safeParse(statusRaw) : null;
    const paginated = params.has("page") || params.has("pageSize");
    const result = await listAppointmentsPage(
      actor,
      {
        status: status && status.success ? status.data : undefined,
        lecturerId: params.get("lecturerId") ?? undefined,
        courseId: params.get("courseId") ?? undefined,
        search: params.get("search") ?? undefined,
        departmentId: params.get("departmentId") ?? undefined,
      },
      paginated ? parsePageParams(params) : undefined,
    );
    return ok({
      appointments: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (err) {
    return pgErrorResponse(err);
  }
}

/** POST /api/appointments — students book for themselves (admins may specify). */
export async function POST(request: NextRequest) {
  try {
    const { actor } = await pgContext(request, ["student", "admin"]);
    const parsed = createSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return pgErrorResponse(new Error("Please check the booking details and try again."));
    }
    const appointment = await createAppointmentAs(actor, {
      studentId: parsed.data.studentId ?? "",
      lecturerId: parsed.data.lecturerId,
      courseId: parsed.data.courseId ?? "",
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      type: parsed.data.type,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
      location: parsed.data.location,
    });
    return ok({ appointment }, 201);
  } catch (err) {
    return pgErrorResponse(err);
  }
}
