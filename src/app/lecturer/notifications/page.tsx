"use client";

import * as React from "react";
import { NotificationsPage } from "@/components/notifications/notifications-page";
import { useLecturerIdentity } from "@/hooks/useSessionIds";
import { LoadingState } from "@/components/loading-state";

export default function LecturerNotificationsPage() {
  const { notifUserId, loading } = useLecturerIdentity();

  if (loading || !notifUserId) {
    return <LoadingState rows={5} />;
  }

  return (
    <NotificationsPage
      userId={notifUserId}
      title="Notifications"
      description="Stay up to date with consultation requests."
    />
  );
}
