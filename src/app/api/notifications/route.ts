import type { NextRequest } from "next/server";
import {
  markAllRead,
  notificationsFor,
  unreadCountFor,
} from "@/lib/db/repositories/notifications";
import { ok, pgContext, pgErrorResponse } from "@/lib/auth/request";

export const runtime = "nodejs";

/** GET /api/notifications — own notifications, newest first. */
export async function GET(request: NextRequest) {
  try {
    const { actor } = await pgContext(request);
    const params = request.nextUrl.searchParams;
    if (params.get("count") === "unread") {
      return ok({ unreadCount: await unreadCountFor(actor.profileId) });
    }
    return ok({ notifications: await notificationsFor(actor.profileId) });
  } catch (err) {
    return pgErrorResponse(err);
  }
}

/** POST /api/notifications/read-all — mark own notifications read. */
export async function POST(request: NextRequest) {
  try {
    const { actor } = await pgContext(request);
    await markAllRead(actor);
    return ok({ ok: true });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
