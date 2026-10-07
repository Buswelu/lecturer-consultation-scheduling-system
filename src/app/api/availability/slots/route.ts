import type { NextRequest } from "next/server";
import { computeSlots } from "@/lib/db/repositories/availability";
import { ok, pgContext, pgErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

/**
 * GET /api/availability/slots?lecturerId&from&to[&excludeAppointmentId][&durationMinutes]
 * Bookable-slot engine (server-computed, never cached client-side).
 */
export async function GET(request: NextRequest) {
  try {
    await pgContext(request);
    const params = request.nextUrl.searchParams;
    const lecturerId = params.get("lecturerId");
    const from = params.get("from");
    const to = params.get("to");
    if (!lecturerId || !from || !to) {
      return pgErrorResponse(new Error("lecturerId, from and to are required."));
    }
    const durationRaw = params.get("durationMinutes");
    const durationMinutes = durationRaw ? Number.parseInt(durationRaw, 10) : undefined;
    const slots = await computeSlots({
      lecturerId,
      from,
      to,
      ...(durationMinutes && durationMinutes > 0 ? { durationMinutes } : {}),
      excludeAppointmentId: params.get("excludeAppointmentId") ?? undefined,
    });
    return ok({ slots });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
