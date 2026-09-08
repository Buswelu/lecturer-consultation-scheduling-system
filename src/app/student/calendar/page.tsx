"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ConsultationCalendar } from "@/components/calendar/consultation-calendar";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { getAppointmentsByStudent } from "@/lib/services/appointments";
import { useStudentIdentity } from "@/hooks/useSessionIds";
import type { Appointment } from "@/lib/types";

export default function StudentCalendarPage() {
  const router = useRouter();
  const { studentId, loading: identityLoading } = useStudentIdentity();
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    if (identityLoading || !studentId) return;
    getAppointmentsByStudent(studentId)
      .then((data) => {
        setAppointments(data);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, [identityLoading, studentId]);

  if (identityLoading || loading) {
    return (
      <div>
        <PageHeader title="My Calendar" />
        <LoadingState rows={3} />
      </div>
    );
  }

  if (loadError || !studentId) {
    return (
      <div>
        <PageHeader title="My Calendar" />
        <ErrorState
          title="Could not load calendar"
          description="Please check your connection and try again."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div>
        <PageHeader title="My Calendar" />
        <EmptyState
          title="No appointments yet"
          description="Your scheduled consultations will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Calendar"
        description="View all your consultation appointments."
      />

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <Badge className="bg-amber-500 text-white">Pending</Badge>
        <Badge className="bg-green-500 text-white">Approved</Badge>
        <Badge className="bg-blue-500 text-white">Completed</Badge>
        <Badge className="bg-gray-500 text-white">Cancelled</Badge>
        <Badge className="bg-red-500 text-white">Rejected / No-show</Badge>
      </div>

      <ConsultationCalendar
        appointments={appointments}
        onEventClick={(id) => router.push(`/student/appointments/${id}`)}
      />
    </div>
  );
}
