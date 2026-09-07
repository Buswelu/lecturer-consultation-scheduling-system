"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/loading-state";
import { getAppointmentsByLecturer } from "@/lib/services/appointments";
import { getAvailabilityForLecturer, getDayLabel } from "@/lib/services/availability";
import { getStudentById } from "@/lib/services/users";
import { getCourseName } from "@/lib/services/lecturers";
import type { Appointment, AppointmentStatus, AvailabilityRule } from "@/lib/types";

const LECTURER_ID = "lec-1";

const statusColors: Record<AppointmentStatus, string> = {
  pending: "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444",
  completed: "#3b82f6",
  cancelled: "#9ca3af",
  rescheduled: "#a855f7",
  "no-show": "#ef4444",
};

export default function LecturerCalendarPage() {
  const router = useRouter();
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [rules, setRules] = React.useState<AvailabilityRule[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      getAppointmentsByLecturer(LECTURER_ID),
      getAvailabilityForLecturer(LECTURER_ID),
    ]).then(([appts, avails]) => {
      setAppointments(appts);
      setRules(avails);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Calendar" />
        <LoadingState rows={3} />
      </div>
    );
  }

  // Build events for appointments
  const appointmentEvents = appointments
    .filter((a) => a.status !== "rejected")
    .map((a) => {
      const student = getStudentById(a.studentId);
      const end = new Date(new Date(a.date).getTime() + 30 * 60000).toISOString();
      return {
        id: a.id,
        title: `${student?.fullName ?? "Student"} - ${getCourseName(a.courseId)}`,
        start: a.date,
        end,
        backgroundColor: statusColors[a.status],
        borderColor: statusColors[a.status],
        textColor: "#ffffff",
        classNames: [`status-${a.status}`],
        extendedProps: { kind: "appointment" },
      };
    });

  // Build availability events (recurring-ish, shown as background for the current week display)
  // For simplicity, show availability as all-day markers on each rule day using a generated date
  const availabilityEvents = rules.map((rule) => {
    const dayIndex = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    }[rule.dayOfWeek];

    // Create a date for this week's matching day
    const today = new Date();
    const diff = (dayIndex - today.getDay() + 7) % 7;
    const date = new Date(today);
    date.setDate(today.getDate() + diff);

    return {
      id: `avail-${rule.id}`,
      title: `Available ${getDayLabel(rule.dayOfWeek)}`,
      start: `${date.toISOString().slice(0, 10)}T${rule.startTime}`,
      end: `${date.toISOString().slice(0, 10)}T${rule.endTime}`,
      backgroundColor: "#e2e8f0",
      borderColor: "#94a3b8",
      textColor: "#475569",
      display: "background",
      classNames: ["availability-slot"],
      extendedProps: { kind: "availability" },
    };
  });

  const allEvents = [...appointmentEvents, ...availabilityEvents];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Manage your consultation schedule and availability."
      />

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <Badge className="bg-green-500 text-white">Approved</Badge>
        <Badge className="bg-amber-500 text-white">Pending</Badge>
        <Badge className="bg-blue-500 text-white">Completed</Badge>
        <Badge className="bg-purple-500 text-white">Rescheduled</Badge>
        <Badge className="bg-gray-400 text-white">Cancelled</Badge>
        <Badge className="bg-red-500 text-white">No-show</Badge>
        <Badge className="bg-slate-200 text-slate-600">Available</Badge>
      </div>

      <div className="fc-container p-2">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek",
          }}
          initialView="timeGridWeek"
          events={allEvents}
          eventClick={(info) => {
            if (info.event.extendedProps?.kind === "appointment") {
              router.push(`/lecturer/appointments/${info.event.id}`);
            }
          }}
          height="700px"
          nowIndicator
          allDaySlot={false}
          slotMinTime="08:00:00"
          slotMaxTime="19:00:00"
          slotDuration="00:30:00"
          buttonText={{
            today: "Today",
            month: "Month",
            week: "Week",
          }}
        />
      </div>
    </div>
  );
}
