"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  MapPin,
  Video,
  FileText,
  CalendarPlus,
  User,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/appointments/appointment-status";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { getAppointmentById, updateAppointmentStatus } from "@/lib/services/appointments";
import { getLecturerName, getCourseName } from "@/lib/services/lecturers";
import { getStudentById } from "@/lib/services/users";
import { formatDate, formatTime, formatDateTime } from "@/lib/format";
import type { Appointment } from "@/lib/types";

export default function StudentAppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [appointment, setAppointment] = React.useState<Appointment | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  React.useEffect(() => {
    const load = async () => {
      const data = await getAppointmentById(params.id);
      setAppointment(data);
      setLoading(false);
    };
    load();
  }, [params.id]);

  const handleCancel = async () => {
    if (!appointment) return;
    setCancelling(true);
    await updateAppointmentStatus(
      appointment.id,
      "cancelled",
      "Cancelled by student",
    );
    setAppointment({ ...appointment, status: "cancelled" });
    setCancelling(false);
    setCancelOpen(false);
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
  const now = new Date();
  const apptDate = new Date(appointment.date);
  const isUpcoming = apptDate >= now && ["pending", "approved", "rescheduled"].includes(appointment.status);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Appointments", href: "/student/appointments" },
          { label: `#${params.id.slice(5)}` },
        ]}
      />

      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/student/appointments">
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
          Consultation with {getLecturerName(appointment.lecturerId)}
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
                    Lecturer
                  </dt>
                  <dd className="mt-1 font-medium">{getLecturerName(appointment.lecturerId)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    Student
                  </dt>
                  <dd className="mt-1 font-medium">{student?.fullName ?? "You"}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Course
                  </dt>
                  <dd className="mt-1 font-medium">
                    {getCourseName(appointment.courseId)} ({appointment.courseId.split("-")[1]?.toUpperCase()})
                  </dd>
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

          {/* Actions based on status */}
          {isUpcoming && (
            <Card>
              <CardContent className="flex flex-wrap gap-3 p-6">
                {["pending", "approved"].includes(appointment.status) && (
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/student/appointments/new?reschedule=${appointment.id}`)}
                  >
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    Reschedule
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={() => setCancelOpen(true)}
                >
                  Cancel Appointment
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* History */}
        <Card className="lg:self-start">
          <CardHeader>
            <CardTitle>Appointment History</CardTitle>
            <CardDescription>Timeline of all changes</CardDescription>
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

      <ConfirmationDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel appointment?"
        description="Are you sure you want to cancel this consultation?"
        confirmLabel="Cancel appointment"
        variant="destructive"
        onConfirm={handleCancel}
        loading={cancelling}
      />
    </div>
  );
}
