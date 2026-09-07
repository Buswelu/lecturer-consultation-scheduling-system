import { getSupabase } from "@/lib/supabase/client";
import { notifications } from "@/lib/mock-data";
import type { Notification } from "@/lib/types";

const IS_MOCK = true;

export async function getNotificationsForUser(userId: string): Promise<Notification[]> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Notification[];
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

export async function markNotificationRead(id: string): Promise<void> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    }
  }
  const notif = notifications.find((n) => n.id === id);
  if (notif) notif.read = true;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from("notifications").update({ read: true }).eq("user_id", userId);
    }
  }
  notifications
    .filter((n) => n.userId === userId)
    .forEach((n) => {
      n.read = true;
    });
}
