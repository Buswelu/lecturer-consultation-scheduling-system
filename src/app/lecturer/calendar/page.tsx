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
import { ErrorState } from "@/components/error-state";
import { getAppointmentsByLecturer } from "@/lib/services/appointments";
import {
  getAvailabilityExceptions,
  getAvailabilityForLecturer,
} from "@/lib/services/availability";
import { getPgCurrentUser } from "@/lib/auth/client";
import { dayNameToIndex } from "@/lib/scheduling/datetime";
import type {
  Appointment,
  AppointmentStatus,
  AvailabilityException,
  AvailabilityRule,
} from "@/lib/types";

const MOCK_LECTURER_ID = "lec-1";

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
  const [exceptions, setExceptions] = React.useState<AvailabilityException[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    const load = async () => {
      try {
        const user = await getPgCurrentUser().catch(() => null);
        const lecturerId = user?.lecturerId ?? MOCK_LECTURER_ID;
        const [appts, avails, exs] = await Promise.all([
          getAppointmentsByLecturer(lecturerId),
          getAvailabilityForLecturer(lecturerId),
          getAvailabilityExceptions(lecturerId),
        ]);
        setAppointments(appts);
        setRules(avails);
        setExceptions(exs);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Calendar" />
        <LoadingState rows={3} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title="Calendar" />
        <ErrorState
          title="Could not load calendar"
          description="Please check your connection and try again."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  const toDateTime = (date: string, time: string): string =>
    date.includes("T") ? date : `${date}T${time}`;

  // Build events for appointments (domain carries explicit start/end).
  const appointmentEvents = appointments
    .filter((a) => a.status !== "rejected")
    .map((a) => {
      return {
        id: a.id,
        title: `${a.studentName ?? "Student"} - ${a.courseName ?? "—"}`,
        start: toDateTime(a.date, a.startTime),
        end: toDateTime(a.date, a.endTime),
        backgroundColor: statusColors[a.status],
        borderColor: statusColors[a.status],
        textColor: "#ffffff",
        classNames: [`status-${a.status}`],
        extendedProps: { kind: "appointment" },
      };
    });

  // Recurring weekly availability as background events (FullCalendar expands
  // daysOfWeek occurrences itself — no manual week math needed).
  const availabilityEvents = rules.map((rule) => ({
    id: `avail-${rule.id}`,
    title: "Available",
    daysOfWeek: [dayNameToIndex(rule.dayOfWeek)],
    startTime: rule.startTime,
    endTime: rule.endTime,
    display: "background",
    backgroundColor: "#e2e8f0",
    borderColor: "#94a3b8",
    textColor: "#475569",
    classNames: ["availability-slot"],
    extendedProps: { kind: "availability" },
  }));

  // Unavailable exception periods as red background blocks.
  const exceptionEvents = exceptions.map((ex) => ({
    id: `ex-${ex.id}`,
    title: ex.reason || "Unavailable",
    start: ex.startDatetime,
    end: ex.endDatetime,
    display: "background",
    backgroundColor: "#fecaca",
    borderColor: "#f87171",
    textColor: "#991b1b",
    classNames: ["exception-slot"],
    extendedProps: { kind: "exception" },
  }));

  const allEvents = [...appointmentEvents, ...availabilityEvents, ...exceptionEvents];

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
        <Badge className="bg-red-200 text-red-800">Unavailable</Badge>
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
