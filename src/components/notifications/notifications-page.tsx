"use client";

import * as React from "react";
import { CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NotificationItem } from "@/components/notifications/notification-item";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { getNotificationsForUser, markNotificationRead, markAllNotificationsRead } from "@/lib/services/notifications";
import type { Notification } from "@/lib/types";

interface NotificationsPageProps {
  userId: string;
  title: string;
  description: string;
}

export function NotificationsPage({ userId, title, description }: NotificationsPageProps) {
  const [notifs, setNotifs] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    getNotificationsForUser(userId).then((data) => {
      setNotifs(data);
      setLoading(false);
    });
  }, [userId]);

  const unreadCount = notifs.filter((n) => !n.read).length;

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(userId);
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={title}
        description={description}
        action={
          unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState rows={5} />
      ) : notifs.length === 0 ? (
        <EmptyState title="No notifications" description="You're all caught up." />
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {notifs.map((notif) => (
              <NotificationItem
                key={notif.id}
                notification={notif}
                onMarkRead={handleMarkRead}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
