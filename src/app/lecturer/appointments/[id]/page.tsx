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
import { getAppointmentById, updateAppointmentStatus } from "@/lib/services/appointments";
import { getStudentById } from "@/lib/services/users";
import { getCourseName } from "@/lib/services/lecturers";
import { formatDate, formatTime, formatDateTime } from "@/lib/format";
import type { Appointment, AppointmentStatus } from "@/lib/types";

export default function LecturerAppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const [appointment, setAppointment] = React.useState<Appointment | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [action, setAction] = React.useState<{ type: string } | null>(null);
  const [processing, setProcessing] = React.useState(false);

  React.useEffect(() => {
    getAppointmentById(params.id).then((data) => {
      setAppointment(data);
      setLoading(false);
    });
  }, [params.id]);

  const handleAction = async () => {
    if (!appointment || !action) return;
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

    await updateAppointmentStatus(appointment.id, status, desc);
    setAppointment({ ...appointment, status });
    setProcessing(false);
    setAction(null);
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
        description="This appointment may no longer exist."
        onRetry={() => window.location.reload()}
      />
    );
  }

  const student = getStudentById(appointment.studentId);

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
          { label: `#${params.id.slice(5)}` },
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
            {getCourseName(appointment.courseId)}
          </h1>
          <StatusBadge status={appointment.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Consultation with {student?.fullName ?? "Student"}
        </p>
      </div>

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
                  <dd className="mt-1 font-medium">{student?.fullName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Course
                  </dt>
                  <dd className="mt-1 font-medium">{getCourseName(appointment.courseId)}</dd>
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
              {student ? (
                <div className="flex items-center gap-3">
                  <Avatar alt={student.fullName} fallback={student.fullName} />
                  <div>
                    <p className="font-medium">{student.fullName}</p>
                    <p className="text-sm text-muted-foreground">{student.email}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {student.programme ?? ""}
                    </p>
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
        open={!!action}
        onOpenChange={(open) => !open && setAction(null)}
        title={confirmConfig?.title ?? "Confirm"}
        description={confirmConfig?.desc}
        confirmLabel={confirmConfig?.label ?? "Confirm"}
        variant={confirmConfig?.variant ?? "default"}
        onConfirm={handleAction}
        loading={processing}
      />
    </div>
  );
}
