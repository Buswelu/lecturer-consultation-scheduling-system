"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarClock,
  FileClock,
  CheckCircle2,
  XCircle,
  Users,
  CalendarPlus,
  CalendarDays,
  BookOpen,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/appointments/appointment-status";
import { getGreeting, formatDate, formatTime } from "@/lib/format";
import { getAppointmentsByStudent } from "@/lib/services/appointments";
import { getNotificationsForUser } from "@/lib/services/notifications";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { getLecturerName, getCourseName } from "@/lib/services/lecturers";
import { useStudentIdentity } from "@/hooks/useSessionIds";
import { todayYMD } from "@/lib/scheduling/datetime";
import { NotificationItem } from "@/components/notifications/notification-item";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import type { Appointment, Notification } from "@/lib/types";

export default function StudentDashboardPage() {
  const { studentId, notifUserId, loading: identityLoading } = useStudentIdentity();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    // Real authenticated profile for the welcome message; falls back to
    // the demo name when Supabase is unconfigured (mock preview mode).
    getCurrentProfile()
      .then((profile) => {
        if (profile) setProfileName(profile.full_name);
      })
      .catch(() => {
        // Keep the fallback name.
      });
    if (identityLoading || !studentId || !notifUserId) return;
    Promise.all([
      getAppointmentsByStudent(studentId),
      getNotificationsForUser(notifUserId),
    ])
      .then(([appts, notifications]) => {
        setAppointments(appts);
        setNotifs(
          [...notifications].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        );
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [identityLoading, studentId, notifUserId]);

  if (identityLoading || loading) {
    return (
      <div className="space-y-8">
        <LoadingState rows={6} />
      </div>
    );
  }

  const today = todayYMD();
  const upcoming = appointments.filter(
    (a) => ["pending", "approved", "rescheduled"].includes(a.status) &&
      a.date.slice(0, 10) >= today,
  );
  const pending = appointments.filter((a) => a.status === "pending");
  const completed = appointments.filter((a) => a.status === "completed");
  const cancelled = appointments.filter((a) => a.status === "cancelled");

  const nextAppointment = upcoming.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {getGreeting()}, {profileName ?? "John"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here is an overview of your consultations.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Upcoming"
          value={upcoming.length}
          icon={CalendarClock}
          description="Approved & pending"
        />
        <StatCard
          title="Pending Requests"
          value={pending.length}
          icon={FileClock}
          iconClassName="bg-amber-500/10 text-amber-600"
        />
        <StatCard
          title="Completed"
          value={completed.length}
          icon={CheckCircle2}
          iconClassName="bg-green-500/10 text-green-600"
        />
        <StatCard
          title="Cancelled"
          value={cancelled.length}
          icon={XCircle}
          iconClassName="bg-destructive/10 text-destructive"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upcoming appointment */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Appointment</CardTitle>
              <CardDescription>Your next scheduled consultation</CardDescription>
            </CardHeader>
            <CardContent>
              {nextAppointment ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {nextAppointment.lecturerName ?? getLecturerName(nextAppointment.lecturerId)}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {nextAppointment.courseName ?? getCourseName(nextAppointment.courseId)}
                      </p>
                    </div>
                    <StatusBadge status={nextAppointment.status} />
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p className="text-muted-foreground">
                      <span className="mr-2 inline-block w-12 font-medium text-foreground">Date</span>
                      {formatDate(nextAppointment.date)}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="mr-2 inline-block w-12 font-medium text-foreground">Time</span>
                      {formatTime(nextAppointment.startTime)} - {formatTime(nextAppointment.endTime)}
                    </p>
                    <p className="text-muted-foreground sm:col-span-2">
                      <span className="mr-2 inline-block w-12 font-medium text-foreground">
                        {nextAppointment.type === "online" ? "Online" : "Location"}
                      </span>
                      {nextAppointment.type === "online"
                        ? "Online consultation"
                        : nextAppointment.location}
                    </p>
                  </div>
                  <div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/student/appointments/${nextAppointment.id}`}>
                        View Details
                        <ArrowRight className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No upcoming consultations"
                  description="Your upcoming consultations will appear here."
                />
              )}
            </CardContent>
          </Card>

          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
                  <Link href="/student/lecturers">
                    <Users className="h-5 w-5" />
                    Find Lecturer
                  </Link>
                </Button>
                <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
                  <Link href="/student/appointments/new">
                    <CalendarPlus className="h-5 w-5" />
                    Book Consultation
                  </Link>
                </Button>
                <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
                  <Link href="/student/calendar">
                    <CalendarDays className="h-5 w-5" />
                    View Calendar
                  </Link>
                </Button>
                <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
                  <Link href="/student/appointments">
                    <BookOpen className="h-5 w-5" />
                    View Appointments
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Notifications</CardTitle>
            <CardDescription>
              <Link href="/student/notifications" className="text-primary hover:underline">
                View all
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {notifs.slice(0, 4).map((notif) => (
              <NotificationItem key={notif.id} notification={notif} />
            ))}
            {notifs.length === 0 && (
              <EmptyState title="No notifications" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
