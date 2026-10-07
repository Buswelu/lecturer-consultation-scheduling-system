"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  MapPin,
  Video,
  FileText,
  User,
  Info,
  Check,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/appointments/appointment-status";
import { Avatar } from "@/components/ui/avatar";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RescheduleDialog } from "@/components/appointments/reschedule-dialog";
import {
  approveAppointment,
  cancelAppointment,
  getAppointmentById,
  markCompleted,
  markNoShow,
  rejectAppointment,
  rescheduleAppointment,
} from "@/lib/services/appointments";
import { formatDate, formatTime, formatDateTime } from "@/lib/format";
import type { Appointment } from "@/lib/types";

export default function LecturerAppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const [appointment, setAppointment] = React.useState<Appointment | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [action, setAction] = React.useState<{ type: string } | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [rescheduling, setRescheduling] = React.useState(false);
  const [rescheduleError, setRescheduleError] = React.useState<string | null>(null);

  // Initial load only (mutations update state from return values).
  React.useEffect(() => {
    let cancelled = false;
    getAppointmentById(params.id)
      .then((data) => {
        if (cancelled) return;
        setAppointment(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAppointment(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const handleAction = async (reason?: string) => {
    if (!appointment || !action) return;
    setProcessing(true);
    setActionError(null);

    try {
      switch (action.type) {
        case "approve":
          setAppointment(await approveAppointment(appointment.id));
          break;
        case "reject":
          setAppointment(await rejectAppointment(appointment.id, reason));
          break;
        case "complete":
          setAppointment(await markCompleted(appointment.id));
          break;
        case "no-show":
          setAppointment(await markNoShow(appointment.id));
          break;
        case "cancel":
          setAppointment(await cancelAppointment(appointment.id, "lecturer"));
          break;
        default:
          return;
      }
      setAction(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not complete the action.");
    } finally {
      setProcessing(false);
    }
  };

  const handleReschedule = async (slot: { date: string; startTime: string; endTime: string }) => {
    if (!appointment) return;
    setRescheduling(true);
    setRescheduleError(null);
    try {
      setAppointment(await rescheduleAppointment(appointment.id, slot));
      setAction(null);
    } catch (e) {
      setRescheduleError(e instanceof Error ? e.message : "Could not reschedule.");
    } finally {
      setRescheduling(false);
    }
  };

  if (loading) {
    return (
      <div>
        <LoadingState rows={4} />
      </div>
    );
  }

  if (!appointment) {
    return (
      <ErrorState
        title="Appointment not found"
        description="This appointment may no longer exist, or you may not have access to it."
        onRetry={() => window.location.reload()}
      />
    );
  }

  const studentName = appointment.studentName ?? "Student";
  const courseName = appointment.courseName ?? "—";

  const confirmConfig = action
    ? {
        approve: {
          title: "Approve request?",
          desc: "Approve this consultation request? The student will be notified.",
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
          desc: "Mark the student as no-show?",
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
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Appointments", href: "/lecturer/appointments" },
          { label: `#${params.id.slice(0, 8)}` },
        ]}
      />

      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/lecturer/appointments">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Appointments
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {courseName}
          </h1>
          <StatusBadge status={appointment.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Consultation with {studentName}
        </p>
      </div>

      {actionError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Appointment Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    Student
                  </dt>
                  <dd className="mt-1 font-medium">{studentName === "Student" ? "—" : studentName}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Course
                  </dt>
                  <dd className="mt-1 font-medium">{courseName}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Date
                  </dt>
                  <dd className="mt-1 font-medium">{formatDate(appointment.date)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Time
                  </dt>
                  <dd className="mt-1 font-medium">
                    {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Type</dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-medium">
                    {appointment.type === "online" ? (
                      <>
                        <Video className="h-3.5 w-3.5" />
                        Online
                      </>
                    ) : (
                      "In-person"
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    {appointment.type === "online" ? (
                      <Video className="h-3.5 w-3.5" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5" />
                    )}
                    {appointment.type === "online" ? "Meeting Link" : "Location"}
                  </dt>
                  <dd className="mt-1 font-medium">
                    {appointment.type === "online"
                      ? appointment.meetingLink ?? "Link will be provided"
                      : appointment.location ?? "On campus"}
                  </dd>
                </div>
              </dl>

              <Separator className="my-6" />

              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Info className="h-4 w-4" />
                  Reason
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{appointment.reason}</p>
                {appointment.notes && (
                  <>
                    <h3 className="mt-4 text-sm font-semibold">Notes</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{appointment.notes}</p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Status-based actions */}
          {["pending", "approved", "rescheduled"].includes(appointment.status) && (
            <Card>
              <CardContent className="flex flex-wrap gap-3 p-6">
                {appointment.status === "pending" && (
                  <>
                    <Button
                      onClick={() => setAction({ type: "approve" })}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setAction({ type: "reject" })}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  </>
                )}
                {appointment.status === "approved" && (
                  <>
                    <Button onClick={() => setAction({ type: "complete" })}>
                      Mark Completed
                    </Button>
                    <Button variant="outline" onClick={() => setAction({ type: "no-show" })}>
                      Mark No-show
                    </Button>
                  </>
                )}
                {["pending", "approved"].includes(appointment.status) && (
                  <Button variant="outline" onClick={() => setAction({ type: "reschedule" })}>
                    Suggest Another Time
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={() => setAction({ type: "cancel" })}
                >
                  Cancel Appointment
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Student info & history */}
        <div className="space-y-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Student</CardTitle>
            </CardHeader>
            <CardContent>
              {studentName !== "Student" ? (
                <div className="flex items-center gap-3">
                  <Avatar alt={studentName} fallback={studentName} />
                  <div>
                    <p className="font-medium">{studentName}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Student info unavailable</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-6">
                {[...appointment.history].reverse().map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                    <p className="text-sm font-medium capitalize">{entry.action}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{entry.description}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground/70">
                      {formatDateTime(entry.date)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmationDialog
        open={!!action && action.type !== "reschedule"}
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

      <RescheduleDialog
        key={action?.type === "reschedule" && appointment ? `res-${appointment.id}` : "closed"}
        open={action?.type === "reschedule"}
        onOpenChange={(open) => !open && setAction(null)}
        appointment={action?.type === "reschedule" ? appointment : null}
        onConfirm={handleReschedule}
        confirming={rescheduling}
        error={rescheduleError}
      />
    </div>
  );
}
