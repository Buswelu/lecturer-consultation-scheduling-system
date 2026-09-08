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
import { ErrorState } from "@/components/error-state";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RescheduleDialog } from "@/components/appointments/reschedule-dialog";
import {
  approveAppointment,
  cancelAppointment,
  getAppointmentsByLecturer,
  markCompleted,
  markNoShow,
  rejectAppointment,
  rescheduleAppointment,
} from "@/lib/services/appointments";
import { getStudentById } from "@/lib/services/users";
import { getCourseName } from "@/lib/services/lecturers";
import { useLecturerIdentity } from "@/hooks/useSessionIds";
import { todayYMD } from "@/lib/scheduling/datetime";
import { formatDate, formatTime } from "@/lib/format";
import type { Appointment } from "@/lib/types";

type TabKey = "pending" | "upcoming" | "completed" | "cancelled" | "all";

export default function LecturerAppointmentsPage() {
  const { lecturerId, loading: identityLoading } = useLecturerIdentity();
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [action, setAction] = React.useState<{
    id: string;
    type: string;
  } | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [rescheduling, setRescheduling] = React.useState(false);
  const [rescheduleError, setRescheduleError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!lecturerId) return;
    try {
      const data = await getAppointmentsByLecturer(lecturerId);
      setAppointments(data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [lecturerId]);

  // Initial load only — the callback above is for event handlers, so the
  // effect inlines its own fetch chain (React Compiler friendly).
  React.useEffect(() => {
    if (identityLoading || !lecturerId) return;
    let cancelled = false;
    getAppointmentsByLecturer(lecturerId)
      .then((data) => {
        if (cancelled) return;
        setAppointments(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identityLoading, lecturerId]);

  const filterByTab = (tab: TabKey): Appointment[] => {
    const today = todayYMD();
    if (tab === "all") return appointments;
    if (tab === "pending") return appointments.filter((a) => a.status === "pending");
    if (tab === "upcoming")
      return appointments.filter(
        (a) =>
          ["approved", "rescheduled"].includes(a.status) &&
          a.date.slice(0, 10) >= today,
      );
    if (tab === "completed")
      return appointments.filter((a) => a.status === "completed");
    return appointments.filter((a) =>
      ["cancelled", "rejected", "no-show"].includes(a.status),
    );
  };

  const handleAction = async (reason?: string) => {
    if (!action) return;
    setProcessing(true);
    setActionError(null);

    try {
      switch (action.type) {
        case "approve":
          await approveAppointment(action.id);
          break;
        case "reject":
          await rejectAppointment(action.id, reason);
          break;
        case "complete":
          await markCompleted(action.id);
          break;
        case "no-show":
          await markNoShow(action.id);
          break;
        case "cancel":
          await cancelAppointment(action.id, "lecturer");
          break;
        default:
          return;
      }
      setAction(null);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not complete the action.");
    } finally {
      setProcessing(false);
    }
  };

  const rescheduleTarget =
    action?.type === "suggest"
      ? (appointments.find((a) => a.id === action.id) ?? null)
      : null;

  const handleReschedule = async (slot: { date: string; startTime: string; endTime: string }) => {
    if (!rescheduleTarget) return;
    setRescheduling(true);
    setRescheduleError(null);
    try {
      await rescheduleAppointment(rescheduleTarget.id, slot);
      setAction(null);
      await load();
    } catch (e) {
      setRescheduleError(e instanceof Error ? e.message : "Could not reschedule.");
    } finally {
      setRescheduling(false);
    }
  };

  if (identityLoading || loading) {
    return (
      <div>
        <PageHeader title="Appointments" />
        <LoadingState rows={5} />
      </div>
    );
  }

  if (loadError || !lecturerId) {
    return (
      <div>
        <PageHeader title="Appointments" />
        <ErrorState
          title="Could not load appointments"
          description={
            lecturerId
              ? "Please check your connection and try again."
              : "Your lecturer account could not be resolved. Please sign in again."
          }
          onRetry={load}
        />
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

      {actionError && (
        <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

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
                    const studentName =
                      appt.studentName ?? getStudentById(appt.studentId)?.fullName ?? "Student";
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
                                  {studentName}
                                </p>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                  {appt.courseName ?? getCourseName(appt.courseId)}
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
        input={
          action?.type === "reject"
            ? {
                label: "Reason for rejection",
                placeholder: "Explain briefly why this request cannot be accommodated…",
              }
            : undefined
        }
      />

      {/* Suggest another time */}
      <RescheduleDialog
        key={rescheduleTarget ? `suggest-${rescheduleTarget.id}` : "closed"}
        open={!!rescheduleTarget}
        onOpenChange={(open) => !open && setAction(null)}
        appointment={rescheduleTarget}
        onConfirm={handleReschedule}
        confirming={rescheduling}
        error={rescheduleError}
      />
    </div>
  );
}
