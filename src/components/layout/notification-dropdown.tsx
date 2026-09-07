"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ui/avatar";
import { getNotificationsForUser, markAllNotificationsRead } from "@/lib/services/notifications";
import { relativeTime } from "@/lib/format";
import type { Notification } from "@/lib/types";

interface NotificationDropdownProps {
  userId: string;
  notificationsUrl: string;
}

export function NotificationDropdown({ userId, notificationsUrl }: NotificationDropdownProps) {
  const [notifs, setNotifs] = React.useState<Notification[]>([]);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      getNotificationsForUser(userId).then(setNotifs);
    }
  }, [open, userId]);

  const unreadCount = notifs.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(userId);
    setNotifs(notifs.map((n) => ({ ...n, read: true })));
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {notifs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            notifs.slice(0, 6).map((notif) => (
              <DropdownMenuItem key={notif.id} className="cursor-default items-start gap-3 py-3">
                <Avatar
                  size="sm"
                  alt={notif.title}
                  fallback={notif.title.slice(0, 2)}
                  className={notif.read ? "opacity-50" : ""}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center justify-between gap-2 text-sm">
                    <span className={cn("truncate font-medium", !notif.read && "font-semibold")}>
                      {notif.title}
                    </span>
                    {!notif.read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {notif.message}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    {relativeTime(notif.createdAt)}
                  </p>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="p-1">
          <Link href={notificationsUrl}>
            <Button variant="ghost" size="sm" className="w-full justify-center text-xs">
              View all notifications
            </Button>
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
