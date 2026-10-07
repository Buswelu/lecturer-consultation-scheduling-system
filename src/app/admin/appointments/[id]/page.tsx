"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, MapPin, Video, User, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/appointments/appointment-status";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import { getAppointmentById } from "@/lib/services/appointments";
import { formatDate, formatTime, formatDateTime } from "@/lib/format";
import type { Appointment } from "@/lib/types";

export default function AdminAppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const [appointment, setAppointment] = React.useState<Appointment | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    getAppointmentById(params.id)
      .then((a) => setAppointment(a))
      .catch(() => setAppointment(null))
      .finally(() => setLoading(false));
  }, [params.id]);

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

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Appointments", href: "/admin/appointments" },
          { label: `#${params.id.slice(5)}` },
        ]}
      />

      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/admin/appointments">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Appointments
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {appointment.courseName ?? "Consultation"}
          </h1>
          <StatusBadge status={appointment.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {appointment.studentName ?? "Student"} with{" "}
          {appointment.lecturerName ?? "Lecturer"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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
                <dd className="mt-1 font-medium">{appointment.studentName ?? "—"}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  Lecturer
                </dt>
                <dd className="mt-1 font-medium">{appointment.lecturerName ?? "—"}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  Course
                </dt>
                <dd className="mt-1 font-medium">{appointment.courseName ?? "—"}</dd>
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
              {appointment.location && (
                <div className="sm:col-span-2">
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    Location
                  </dt>
                  <dd className="mt-1 font-medium">{appointment.location}</dd>
                </div>
              )}
            </dl>
            <Separator className="my-6" />
            <div>
              <h3 className="text-sm font-semibold">Reason</h3>
              <p className="mt-2 text-sm text-muted-foreground">{appointment.reason}</p>
              {appointment.notes && (
                <>
                  <h3 className="mt-4 text-sm font-semibold">Notes</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{appointment.notes}</p>
                </>
              )}
            </div>
            <Separator className="my-6" />
            <p className="text-xs text-muted-foreground">
              Created {formatDateTime(appointment.createdAt)}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:self-start">
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
  );
}