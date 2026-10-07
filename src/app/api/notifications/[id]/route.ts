import type { NextRequest } from "next/server";
import { markRead } from "@/lib/db/repositories/notifications";
import { ok, pgContext, pgErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

/** PATCH /api/notifications/[id] — mark own notification read. */
export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await pgContext(_request);
    const { id } = await params;
    await markRead(actor, id);
    return ok({ ok: true });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
