"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ConsultationCalendar } from "@/components/calendar/consultation-calendar";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { getAppointmentsByStudent } from "@/lib/services/appointments";
import type { Appointment } from "@/lib/types";

const STUDENT_ID = "stud-1";

export default function StudentCalendarPage() {
  const router = useRouter();
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    getAppointmentsByStudent(STUDENT_ID).then((data) => {
      setAppointments(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="My Calendar" />
        <LoadingState rows={3} />
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
