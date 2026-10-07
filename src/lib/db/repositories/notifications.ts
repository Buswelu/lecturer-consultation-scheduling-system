/**
 * LCSS — notifications repository (server-only).
 *
 * Reads are owner-or-admin. Writes happen server-side inside appointment
 * transactions (never from the browser directly — no public create route).
 */
import "server-only";
import { getPool } from "@/lib/db/pool";
import { queryOne } from "@/lib/db/query";
import type { PoolClient } from "pg";
import { mapNotification, toDbNotificationType } from "@/lib/db/mappers";
import type { Notification } from "@/lib/types";
import type { Actor, NotificationsRow } from "./types";
import { ForbiddenError } from "./types";

export async function notificationsFor(profileId: string): Promise<Notification[]> {
  const { rows } = await getPool().query<NotificationsRow>(
    "select * from public.notifications where user_id = $1 order by created_at desc",
    [profileId],
  );
  return rows.map(mapNotification);
}

export async function unreadCountFor(profileId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    "select count(*) as count from public.notifications where user_id = $1 and not is_read",
    [profileId],
  );
  return Number(row?.count ?? 0);
}

export async function markRead(actor: Actor, id: string): Promise<void> {
  const row = await queryOne<{ user_id: string }>(
    "select user_id from public.notifications where id = $1",
    [id],
  );
  if (!row) return;
  if (actor.role !== "admin" && row.user_id !== actor.profileId) {
    throw new ForbiddenError();
  }
  await getPool().query("update public.notifications set is_read = true where id = $1", [id]);
}

export async function markAllRead(actor: Actor): Promise<void> {
  await getPool().query("update public.notifications set is_read = true where user_id = $1", [
    actor.profileId,
  ]);
}

export interface NewNotification {
  userId: string;
  title: string;
  message: string;
  type: Notification["type"];
  appointmentId?: string;
}

/** Transactional insert for use inside appointment mutations. */
export async function insertNotificationTx(
  tx: Pick<PoolClient, "query">,
  input: NewNotification,
): Promise<void> {
  await tx.query(
    `insert into public.notifications (user_id, title, message, type, appointment_id)
     values ($1, $2, $3, $4, $5)`,
    [
      input.userId,
      input.title,
      input.message,
      toDbNotificationType(input.type),
      input.appointmentId ?? null,
    ],
  );
}
