/**
 * LCSS — notifications service (PostgreSQL-backed fetch client).
 *
 * Same contracts as before; reads/writes go through `/api/notifications`
 * (owner-scoped server-side). Creation happens inside appointment
 * transactions — there is no public create endpoint by design.
 */
import { apiGet, apiSend } from "./http";
import type { Notification } from "@/lib/types";

/** Notifications for the authenticated user, newest first. */
export async function getNotifications(userId: string): Promise<Notification[]> {
  return getNotificationsForUser(userId);
}

export async function getNotificationsForUser(userId: string): Promise<Notification[]> {
  void userId;
  // The server scopes to the authenticated user; the parameter is kept
  // for contract compatibility.
  const data = await apiGet<{ notifications: Notification[] }>("/api/notifications");
  return data.notifications;
}

export async function getUnreadCount(userId: string): Promise<number> {
  void userId;
  const data = await apiGet<{ unreadCount: number }>("/api/notifications?count=unread");
  return data.unreadCount;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiSend(`/api/notifications/${encodeURIComponent(id)}`, "PATCH");
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  void userId;
  await apiSend("/api/notifications/read-all", "POST");
}
