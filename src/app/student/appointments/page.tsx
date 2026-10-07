"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarPlus, ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/appointments/appointment-status";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { cancelAppointment, getAppointmentsByStudent } from "@/lib/services/appointments";
import { useStudentIdentity } from "@/hooks/useSessionIds";
import { todayYMD } from "@/lib/scheduling/datetime";
import { formatDate, formatTime } from "@/lib/format";
import type { Appointment } from "@/lib/types";

type TabKey = "all" | "pending" | "upcoming" | "completed" | "cancelled";

const tabs: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

const UPCOMING_STATUSES = ["pending", "approved", "rescheduled"];
const CANCELLABLE_STATUSES = ["pending", "approved", "rescheduled"];

export default function StudentAppointmentsPage() {
  const { studentId, loading: identityLoading } = useStudentIdentity();
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [cancelId, setCancelId] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!studentId) return;
    try {
      const data = await getAppointmentsByStudent(studentId);
      setAppointments(data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  // Initial load only — `load` above is for event handlers, so the effect
  // inlines its own fetch chain (React Compiler friendly).
  React.useEffect(() => {
    if (identityLoading || !studentId) return;
    let cancelled = false;
    getAppointmentsByStudent(studentId)
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
  }, [identityLoading, studentId]);

  const filterByTab = (tab: TabKey): Appointment[] => {
    const today = todayYMD();
    if (tab === "all") return appointments;
    if (tab === "pending")
      return appointments.filter((a) => a.status === "pending");
    if (tab === "upcoming")
      return appointments.filter(
        (a) =>
          UPCOMING_STATUSES.includes(a.status) && a.date.slice(0, 10) >= today,
      );
    if (tab === "completed")
      return appointments.filter((a) => a.status === "completed");
    return appointments.filter((a) => ["cancelled", "rejected", "no-show"].includes(a.status));
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    setCancelling(true);
    setActionError(null);
    try {
      await cancelAppointment(cancelId, "student");
      setCancelId(null);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not cancel the appointment.");
    } finally {
      setCancelling(false);
    }
  };

  if (identityLoading || loading) {
    return (
      <div>
        <PageHeader title="My Appointments" />
        <LoadingState rows={5} />
      </div>
    );
  }

  if (loadError || !studentId) {
    return (
      <div>
        <PageHeader title="My Appointments" />
        <ErrorState
          title="Could not load appointments"
          description={
            studentId
              ? "Please check your connection and try again."
              : "Your student account could not be resolved. Please sign in again."
          }
          onRetry={load}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My Appointments"
        description="View and manage your consultation appointments."
        action={
          <Button asChild>
            <Link href="/student/appointments/new">
              <CalendarPlus className="mr-2 h-4 w-4" />
              Book Consultation
            </Link>
          </Button>
        }
      />

      {actionError && (
        <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <Tabs defaultValue="all" className="mt-6">
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
                  description={
                    tab.key === "all"
                      ? "Book your first consultation to get started."
                      : "Appointments in this category will appear here."
                  }
                  action={
                    <Button variant="outline" asChild>
                      <Link href="/student/lecturers">Find a Lecturer</Link>
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {items.map((appt) => (
                    <Card key={appt.id}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold">
                              {appt.lecturerName ?? "Lecturer"}
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {appt.courseName ?? "—"}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <StatusBadge status={appt.status} />
                            <Badge variant="outline">
                              {appt.type === "online" ? "Online" : "In-person"}
                            </Badge>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                          <p className="flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                            {formatDate(appt.date)}
                          </p>
                          <p className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            {formatTime(appt.startTime)} - {formatTime(appt.endTime)}
                          </p>
                          {appt.location && (
                            <p className="flex items-center gap-1.5 sm:col-span-2">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              {appt.location}
                            </p>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/student/appointments/${appt.id}`}>
                              View
                              <ArrowRight className="ml-2 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          {CANCELLABLE_STATUSES.includes(appt.status) && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setCancelId(appt.id)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <ConfirmationDialog
        open={!!cancelId}
        onOpenChange={(open) => !open && setCancelId(null)}
        title="Cancel Consultation?"
        description="Are you sure you want to cancel this consultation?"
        confirmLabel="Cancel Consultation"
        cancelLabel="Keep Appointment"
        variant="destructive"
        onConfirm={handleCancel}
        loading={cancelling}
      />
    </div>
  );
}
