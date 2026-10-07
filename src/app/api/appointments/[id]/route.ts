import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  approveAppointmentAs,
  cancelAppointmentAs,
  completeAppointmentAs,
  getAppointment,
  noShowAppointmentAs,
  rejectAppointmentAs,
  rescheduleAppointmentAs,
  setAppointmentStatusAs,
  updateAppointmentFieldsAs,
} from "@/lib/db/repositories/appointments";
import { ok, pgContext, pgErrorResponse, readJson } from "@/lib/auth/request";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("no_show") }),
  z.object({
    action: z.literal("reschedule"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  z.object({
    action: z.literal("update"),
    notes: z.string().trim().max(2000).nullable().optional(),
    location: z.string().trim().max(500).nullable().optional(),
    meetingLink: z.string().trim().max(500).nullable().optional(),
    rejectionReason: z.string().trim().max(1000).nullable().optional(),
  }),
  z.object({
    action: z.literal("status"),
    status: z.enum(["pending", "approved", "rejected", "cancelled", "completed", "rescheduled", "no-show"]),
    description: z.string().trim().max(1000).optional(),
  }),
]);

/** GET /api/appointments/[id] — involved party or admin. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await pgContext(_request);
    const { id } = await params;
    const appointment = await getAppointment(actor, id);
    if (!appointment) return pgErrorResponse(new Error("Appointment not found."));
    return ok({ appointment });
  } catch (err) {
    return pgErrorResponse(err);
  }
}

/** PATCH /api/appointments/[id] — action-based transitions (server-authorized). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await pgContext(request);
    const { id } = await params;
    const parsed = actionSchema.safeParse(await readJson(request));
    if (!parsed.success) return pgErrorResponse(new Error("Invalid request."));
    const body = parsed.data;
    let appointment = null;
    switch (body.action) {
      case "approve":
        appointment = await approveAppointmentAs(actor, id);
        break;
      case "reject":
        appointment = await rejectAppointmentAs(actor, id, body.reason);
        break;
      case "cancel":
        appointment = await cancelAppointmentAs(actor, id);
        break;
      case "complete":
        appointment = await completeAppointmentAs(actor, id);
        break;
      case "no_show":
        appointment = await noShowAppointmentAs(actor, id);
        break;
      case "reschedule":
        appointment = await rescheduleAppointmentAs(actor, id, {
          date: body.date,
          startTime: body.startTime,
          endTime: body.endTime,
        });
        break;
      case "update":
        appointment = await updateAppointmentFieldsAs(actor, id, {
          notes: body.notes ?? undefined,
          location: body.location ?? undefined,
          meetingLink: body.meetingLink ?? undefined,
          rejectionReason: body.rejectionReason ?? undefined,
        });
        break;
      case "status":
        appointment = await setAppointmentStatusAs(actor, id, body.status, body.description);
        break;
      default:
        break;
    }
    if (!appointment) return pgErrorResponse(new Error("Appointment not found."));
    return ok({ appointment });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
