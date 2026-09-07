"use client";

import * as React from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type { EventClickArg } from "@fullcalendar/core";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { getLecturerName, getCourseName } from "@/lib/services/lecturers";

const statusColors: Record<AppointmentStatus, string> = {
  pending: "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444",
  completed: "#3b82f6",
  cancelled: "#6b7280",
  rescheduled: "#a855f7",
  "no-show": "#ef4444",
};

interface ConsultationCalendarProps {
  appointments: Appointment[];
  onEventClick: (appointmentId: string) => void;
  height?: string;
}

export function ConsultationCalendar({
  appointments,
  onEventClick,
  height = "700px",
}: ConsultationCalendarProps) {
  const events = appointments.map((appt) => ({
    id: appt.id,
    title: `${getLecturerName(appt.lecturerId)} - ${getCourseName(appt.courseId)}`,
    start: appt.date,
    end: new Date(new Date(appt.date).getTime() + 30 * 60000).toISOString(),
    backgroundColor: statusColors[appt.status],
    borderColor: statusColors[appt.status],
    textColor: "#ffffff",
    extendedProps: {
      status: appt.status,
      type: appt.type,
    },
  }));

  const handleEventClick = (info: EventClickArg) => {
    onEventClick(info.event.id);
  };

  return (
    <div className="fc-container p-2">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,listWeek",
        }}
        initialView="dayGridMonth"
        events={events}
        eventClick={handleEventClick}
        height={height}
        nowIndicator
        buttonText={{
          today: "Today",
          month: "Month",
          week: "Week",
          list: "List",
        }}
        allDaySlot={false}
      />
    </div>
  );
}
