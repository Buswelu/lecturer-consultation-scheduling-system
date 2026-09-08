import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  mapNotification,
  toDbNotificationType,
} from "@/lib/supabase/mappers";
import type { DbNotificationType } from "@/lib/supabase/database.types";
import { isUuid } from "@/lib/scheduling/datetime";
import { notifications } from "@/lib/mock-data";
import type { Notification } from "@/lib/types";

/**
 * Phase 5 data mode: live Supabase when configured, mock fallback otherwise.
 * `IS_MOCK = true` remains as an explicit kill-switch (demos/tests).
 */
const IS_MOCK = false;

function isLive(): boolean {
  return !IS_MOCK && isSupabaseConfigured();
}

/** Live UUID-column queries reject mock-style ids — route those to mock. */
function isLiveId(id: string): boolean {
  return isLive() && isUuid(id);
}

/** Notifications for a user (profile id), newest first. */
export async function getNotifications(userId: string): Promise<Notification[]> {
  return getNotificationsForUser(userId);
}

export async function getNotificationsForUser(userId: string): Promise<Notification[]> {
  if (isLiveId(userId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapNotification);
    }
  }
  return notifications
    .filter((n) => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getUnreadCount(userId: string): Promise<number> {
  const items = await getNotificationsForUser(userId);
  return items.filter((n) => !n.read).length;
}

export interface CreateNotificationInput {
  userId: string;
  title: string;
  message: string;
  type?: Notification["type"];
  appointmentId?: string;
}

/**
 * Create a notification (future phases: booking events, reminders).
 * System callers normally use the service-role client, which bypasses RLS.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<Notification> {
  // NOTE: live transitions rely on the DB notify trigger (clients cannot
  // insert for other users under RLS); this live branch serves admin/system
  // callers inserting for themselves.
  if (isLive() && isUuid(input.userId)) {
    const supabase = getSupabase();
    if (supabase) {
      const type: DbNotificationType | undefined = input.type
        ? toDbNotificationType(input.type)
        : undefined;
      const { data, error } = await supabase
        .from("notifications")
        .insert({
          user_id: input.userId,
          title: input.title,
          message: input.message,
          ...(type ? { type } : {}),
          ...(input.appointmentId ? { appointment_id: input.appointmentId } : {}),
        })
        .select()
        .single();
      if (error) throw error;
      return mapNotification(data);
    }
  }

  const now = new Date().toISOString();
  const created: Notification = {
    id: `notif-${Date.now()}`,
    userId: input.userId,
    title: input.title,
    message: input.message,
    read: false,
    type: input.type ?? "system",
    appointmentId: input.appointmentId,
    createdAt: now,
  };
  notifications.push(created);
  return created;
}

export async function markNotificationRead(id: string): Promise<void> {
  if (isLiveId(id)) {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
    }
  }
  const notif = notifications.find((n) => n.id === id);
  if (notif) notif.read = true;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  if (isLiveId(userId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId);
      if (error) throw error;
    }
  }
  notifications
    .filter((n) => n.userId === userId)
    .forEach((n) => {
      n.read = true;
    });
}
