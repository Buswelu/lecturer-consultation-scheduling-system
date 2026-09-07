"use client";

import { CheckCheck, CalendarCheck, CalendarX, Clock, Megaphone, UserCheck, UserX, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { relativeTime } from "@/lib/format";
import type { Notification } from "@/lib/types";

interface NotificationItemProps {
  notification: Notification;
  onMarkRead?: (id: string) => void;
}

function getIcon(type: Notification["type"], className: string) {
  switch (type) {
    case "appointment":
      return <CalendarClock className={className} />;
    case "request":
      return <CalendarCheck className={className} />;
    case "approval":
      return <UserCheck className={className} />;
    case "rejection":
      return <UserX className={className} />;
    case "cancellation":
      return <CalendarX className={className} />;
    case "reschedule":
      return <CalendarClock className={className} />;
    case "reminder":
      return <Clock className={className} />;
    default:
      return <Megaphone className={className} />;
  }
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg p-4 transition-colors",
        !notification.read && "bg-accent/50 cursor-pointer hover:bg-accent/80",
        notification.read && "hover:bg-muted/50",
      )}
      onClick={() => !notification.read && onMarkRead?.(notification.id)}
      role={!notification.read ? "button" : undefined}
      tabIndex={!notification.read ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !notification.read) onMarkRead?.(notification.id);
      }}
    >
      <Avatar
        size="sm"
        alt={notification.title}
        fallback={notification.title.slice(0, 2)}
        className={notification.read ? "opacity-50" : ""}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {getIcon(
              notification.type,
              cn("h-4 w-4 shrink-0", notification.read ? "text-muted-foreground" : "text-primary"),
            )}
            <p className={cn("truncate text-sm", notification.read ? "text-muted-foreground" : "font-semibold")}>
              {notification.title}
            </p>
          </div>
          {!notification.read && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead?.(notification.id);
              }}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Mark as read"
            >
              <CheckCheck className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{notification.message}</p>
        <p className="mt-1 text-xs text-muted-foreground/70">{relativeTime(notification.createdAt)}</p>
      </div>
    </div>
  );
}
