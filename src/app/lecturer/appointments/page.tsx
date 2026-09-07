"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  X,
  CalendarClock,
  Clock,
  CalendarDays,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/appointments/appointment-status";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { getAppointmentsByLecturer, updateAppointmentStatus } from "@/lib/services/appointments";
import { getStudentById } from "@/lib/services/users";
import { getCourseName } from "@/lib/services/lecturers";
import { formatDate, formatTime } from "@/lib/format";
import type { Appointment, AppointmentStatus } from "@/lib/types";

const LECTURER_ID = "lec-1";

type TabKey = "pending" | "upcoming" | "completed" | "cancelled" | "all";

export default function LecturerAppointmentsPage() {
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [action, setAction] = React.useState<{
    id: string;
    type: string;
  } | null>(null);
  const [processing, setProcessing] = React.useState(false);

  React.useEffect(() => {
    getAppointmentsByLecturer(LECTURER_ID).then((data) => {
      setAppointments(data);
      setLoading(false);
    });
  }, []);

  const filterByTab = (tab: TabKey): Appointment[] => {
    if (tab === "all") return appointments;
    if (tab === "pending") return appointments.filter((a) => a.status === "pending");
    if (tab === "upcoming")
      return appointments.filter(
        (a) =>
          ["approved", "rescheduled"].includes(a.status) &&
          new Date(a.date) >= new Date(),
      );
    if (tab === "completed")
      return appointments.filter((a) => a.status === "completed");
    return appointments.filter((a) =>
      ["cancelled", "rejected", "no-show"].includes(a.status),
    );
  };

  const handleAction = async () => {
    if (!action) return;
    setProcessing(true);

    let status: AppointmentStatus;
    let desc: string;

    switch (action.type) {
      case "approve":
        status = "approved";
        desc = "Request approved by lecturer";
        break;
      case "reject":
        status = "rejected";
        desc = "Request rejected by lecturer";
        break;
      case "complete":
        status = "completed";
        desc = "Consultation marked as completed";
        break;
      case "no-show":
        status = "no-show";
        desc = "Student marked as no-show";
        break;
      case "cancel":
        status = "cancelled";
        desc = "Cancelled by lecturer";
        break;
      default:
        setProcessing(false);
        setAction(null);
        return;
    }

    await updateAppointmentStatus(action.id, status, desc);
    setAppointments((prev) =>
      prev.map((a) => (a.id === action.id ? { ...a, status } : a)),
    );
    setProcessing(false);
    setAction(null);
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Appointments" />
        <LoadingState rows={5} />
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "upcoming", label: "Upcoming" },
    { key: "completed", label: "Completed" },
    { key: "cancelled", label: "Cancelled" },
    { key: "all", label: "All" },
  ];

  const confirmConfig = action
    ? {
        approve: {
          title: "Approve request?",
          desc: "Approve this consultation request?",
          label: "Approve",
          variant: "default" as const,
        },
        reject: {
          title: "Reject request?",
          desc: "Reject this consultation request? The student will be notified.",
          label: "Reject",
          variant: "destructive" as const,
        },
        complete: {
          title: "Mark as completed?",
          desc: "Mark this consultation as completed?",
          label: "Complete",
          variant: "default" as const,
        },
        "no-show": {
          title: "Mark as No-show?",
          desc: "Mark the student as no-show for this appointment?",
          label: "Mark no-show",
          variant: "destructive" as const,
        },
        cancel: {
          title: "Cancel appointment?",
          desc: "Cancel this appointment? The student will be notified.",
          label: "Cancel",
          variant: "destructive" as const,
        },
      }[action.type]
    : null;

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Manage consultation requests and appointments."
      />

      <Tabs defaultValue="pending" className="mt-6">
        <TabsList className="flex w-full flex-wrap justify-start overflow-x-auto sm:w-auto">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
              <span className="ml-1 text-muted-foreground">
                ({filterByTab(tab.key).length})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => {
          const items = filterByTab(tab.key);
          return (
            <TabsContent key={tab.key} value={tab.key} className="mt-4">
              {items.length === 0 ? (
                <EmptyState
                  title={`No ${tab.label.toLowerCase()} appointments`}
                  description="Appointments in this category will appear here."
                />
              ) : (
                <div className="grid gap-4">
                  {items.map((appt) => {
                    const student = getStudentById(appt.studentId);
                    return (
                      <Card key={appt.id}>
                        <CardContent className="p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                                <User className="h-5 w-5 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="font-semibold">
                                  {student?.fullName ?? "Student"}
                                </p>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                  {getCourseName(appt.courseId)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <StatusBadge status={appt.status} />
                              <Badge variant="outline">
                                {appt.type === "online" ? "Online" : "In-person"}
                              </Badge>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                            <p className="flex items-center gap-1.5">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {formatDate(appt.date)}
                            </p>
                            <p className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" />
                              {formatTime(appt.startTime)} - {formatTime(appt.endTime)}
                            </p>
                          </div>

                          {appt.reason && (
                            <p className="mt-2 text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">
                                Reason:
                              </span>{" "}
                              {appt.reason}
                            </p>
                          )}

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/lecturer/appointments/${appt.id}`}>
                                View Details
                              </Link>
                            </Button>

                            {appt.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    setAction({ id: appt.id, type: "approve" })
                                  }
                                >
                                  <Check className="mr-1.5 h-4 w-4" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setAction({ id: appt.id, type: "reject" })
                                  }
                                >
                                  <X className="mr-1.5 h-4 w-4" />
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setAction({ id: appt.id, type: "suggest" })
                                  }
                                >
                                  <CalendarClock className="mr-1.5 h-4 w-4" />
                                  Suggest Time
                                </Button>
                              </>
                            )}

                            {appt.status === "approved" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setAction({ id: appt.id, type: "complete" })
                                  }
                                >
                                  <Check className="mr-1.5 h-4 w-4" />
                                  Mark Completed
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setAction({ id: appt.id, type: "no-show" })
                                  }
                                >
                                  <X className="mr-1.5 h-4 w-4" />
                                  No-show
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() =>
                                    setAction({ id: appt.id, type: "cancel" })
                                  }
                                >
                                  Cancel
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <ConfirmationDialog
        open={!!action && action.type !== "suggest"}
        onOpenChange={(open) => !open && setAction(null)}
        title={confirmConfig?.title ?? "Confirm"}
        description={confirmConfig?.desc}
        confirmLabel={confirmConfig?.label ?? "Confirm"}
        variant={confirmConfig?.variant ?? "default"}
        onConfirm={handleAction}
        loading={processing}
      />

      {/* Suggest another time dialog */}
      <ConfirmationDialog
        open={!!action && action.type === "suggest"}
        onOpenChange={(open) => !open && setAction(null)}
        title="Suggest another time"
        description="This feature is coming soon. The student will be notified with a proposed alternative."
        confirmLabel="OK, notify student"
        onConfirm={handleAction}
        loading={processing}
      />
    </div>
  );
}
