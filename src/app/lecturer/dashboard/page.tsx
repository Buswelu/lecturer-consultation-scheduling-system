"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
import { getAppointmentsByLecturer } from "@/lib/services/appointments";
import { getStudentById } from "@/lib/services/users";
import { getCourseName } from "@/lib/services/lecturers";
import { EmptyState } from "@/components/empty-state";
import type { Appointment } from "@/lib/types";

const LECTURER_ID = "lec-1";

export default function LecturerDashboardPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    getAppointmentsByLecturer(LECTURER_ID).then((data) => {
      setAppointments(data);
    });
  }, []);

  const today = new Date();
  const todayAppts = appointments.filter(
    (a) =>
      new Date(a.date).toDateString() === today.toDateString() &&
      a.status === "approved",
  );
  const pending = appointments.filter((a) => a.status === "pending");
  const upcoming = appointments.filter(
    (a) =>
      ["approved", "rescheduled"].includes(a.status) && new Date(a.date) >= today,
  );
  const completed = appointments.filter((a) => a.status === "completed");

  const nextAppt = upcoming.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {getGreeting()}, Dr. Sarah
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here is an overview of your consultation schedule.
        </p>
      </div>

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
                  const student = getStudentById(appt.studentId);
                  return (
                    <div
                      key={appt.id}
                      className="rounded-lg border p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{student?.fullName ?? "Student"}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {getCourseName(appt.courseId)}
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
                        <Button size="sm" variant="default">
                          <Check className="mr-1.5 h-4 w-4" />
                          Approve
                        </Button>
                        <Button size="sm" variant="outline">
                          <X className="mr-1.5 h-4 w-4" />
                          Reject
                        </Button>
                        <Button size="sm" variant="outline">
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
                    {getStudentById(nextAppt.studentId)?.fullName ?? "Student"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {getCourseName(nextAppt.courseId)}
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
    </div>
  );
}
