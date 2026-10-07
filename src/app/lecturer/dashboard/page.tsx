"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  FileClock,
  CheckCircle2,
  Clock,
  Check,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/appointments/appointment-status";
import { Badge } from "@/components/ui/badge";
import { getGreeting, formatDate, formatTime, formatDateLong } from "@/lib/format";
import {
  approveAppointment,
  getAppointmentsByLecturer,
  rejectAppointment,
  rescheduleAppointment,
} from "@/lib/services/appointments";
import { getPgCurrentUser } from "@/lib/auth/client";
import { useLecturerIdentity } from "@/hooks/useSessionIds";
import { todayYMD } from "@/lib/scheduling/datetime";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RescheduleDialog } from "@/components/appointments/reschedule-dialog";
import type { Appointment } from "@/lib/types";

export default function LecturerDashboardPage() {
  const { lecturerId, loading: identityLoading } = useLecturerIdentity();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [action, setAction] = useState<{ id: string; type: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const load = useCallback(async () => {
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

  useEffect(() => {
    // Real PostgreSQL-authenticated profile for the welcome message.
    getPgCurrentUser()
      .then((user) => {
        if (user) setProfileName(user.fullName);
      })
      .catch(() => {
        // Keep the greeting without a name.
      });
  }, []);

  // Initial load only — `load` above is for event handlers, so the effect
  // inlines its own fetch chain (React Compiler friendly).
  useEffect(() => {
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

  const handleAction = async (reason?: string) => {
    if (!action) return;
    setProcessing(true);
    setActionError(null);
    try {
      if (action.type === "approve") await approveAppointment(action.id);
      else if (action.type === "reject") await rejectAppointment(action.id, reason);
      else return;
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
      <div className="space-y-8">
        <LoadingState rows={6} />
      </div>
    );
  }

  if (loadError || !lecturerId) {
    return (
      <div className="space-y-8">
        <ErrorState
          title="Could not load dashboard"
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

  const today = todayYMD();
  const todayAppts = appointments.filter(
    (a) => a.date.slice(0, 10) === today && a.status === "approved",
  );
  const pending = appointments.filter((a) => a.status === "pending");
  const upcoming = appointments.filter(
    (a) =>
      ["approved", "rescheduled"].includes(a.status) && a.date.slice(0, 10) >= today,
  );
  const completed = appointments.filter((a) => a.status === "completed");

  const nextAppt = upcoming.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {getGreeting()}{profileName ? `, ${profileName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here is an overview of your consultation schedule.
        </p>
      </div>

      {actionError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Today's Consultations"
          value={todayAppts.length}
          icon={Clock}
          description="Scheduled for today"
        />
        <StatCard
          title="Pending Requests"
          value={pending.length}
          icon={FileClock}
          iconClassName="bg-amber-500/10 text-amber-600"
        />
        <StatCard
          title="Upcoming"
          value={upcoming.length}
          icon={CalendarClock}
          description="Approved consultations"
        />
        <StatCard
          title="Completed"
          value={completed.length}
          icon={CheckCircle2}
          iconClassName="bg-green-500/10 text-green-600"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pending requests */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Pending Consultation Requests</CardTitle>
              <CardDescription>
                {pending.length > 0
                  ? "Approve, reject, or suggest another time"
                  : "No pending requests"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pending.length === 0 ? (
                <EmptyState
                  title="No pending requests"
                  description="New consultation requests will appear here."
                />
              ) : (
                pending.map((appt) => {
                  const studentName = appt.studentName ?? "Student";
                  return (
                    <div
                      key={appt.id}
                      className="rounded-lg border p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{studentName}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {appt.courseName ?? "—"}
                          </p>
                        </div>
                      <StatusBadge status={appt.status} />
                      </div>
                      <div className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
                        <p className="flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                          {formatDate(appt.date)}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          {formatTime(appt.startTime)} - {formatTime(appt.endTime)}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Reason:</span>{" "}
                        {appt.reason}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => setAction({ id: appt.id, type: "approve" })}
                        >
                          <Check className="mr-1.5 h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAction({ id: appt.id, type: "reject" })}
                        >
                          <X className="mr-1.5 h-4 w-4" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAction({ id: appt.id, type: "suggest" })}
                        >
                          <CalendarClock className="mr-1.5 h-4 w-4" />
                          Suggest Time
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Next Consultation</CardTitle>
            </CardHeader>
            <CardContent>
              {nextAppt ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{formatDate(nextAppt.date)}</Badge>
                    <StatusBadge status={nextAppt.status} />
                  </div>
                  <p className="font-semibold">
                    {nextAppt.studentName ?? "Student"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {nextAppt.courseName ?? "—"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateLong(nextAppt.date)} · {formatTime(nextAppt.startTime)} -{" "}
                    {formatTime(nextAppt.endTime)}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    asChild
                  >
                    <Link href={`/lecturer/appointments/${nextAppt.id}`}>
                      View Details
                    </Link>
                  </Button>
                </div>
              ) : (
                <EmptyState
                  title="No upcoming consultations"
                  description="Your next consultation will appear here."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/lecturer/availability">
                  <Clock className="mr-2 h-4 w-4" />
                  Manage Availability
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/lecturer/calendar">
                  <CalendarClock className="mr-2 h-4 w-4" />
                  View Calendar
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/lecturer/appointments">
                  <FileClock className="mr-2 h-4 w-4" />
                  All Appointments
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmationDialog
        open={!!action && action.type !== "suggest"}
        onOpenChange={(open) => !open && setAction(null)}
        title={action?.type === "approve" ? "Approve request?" : "Reject request?"}
        description={
          action?.type === "approve"
            ? "Approve this consultation request?"
            : "Reject this consultation request? The student will be notified."
        }
        confirmLabel={action?.type === "approve" ? "Approve" : "Reject"}
        variant={action?.type === "approve" ? "default" : "destructive"}
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

      <RescheduleDialog
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
