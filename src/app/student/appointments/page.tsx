"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/appointments/appointment-status";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { getAppointmentsByStudent, updateAppointmentStatus } from "@/lib/services/appointments";
import { getLecturerName, getCourseName } from "@/lib/services/lecturers";
import { formatDate, formatTime } from "@/lib/format";
import type { Appointment, AppointmentStatus } from "@/lib/types";

const STUDENT_ID = "stud-1";

type TabKey = "all" | "pending" | "upcoming" | "completed" | "cancelled";

const tabs: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export default function StudentAppointmentsPage() {
  const router = useRouter();
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [cancelId, setCancelId] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState(false);

  React.useEffect(() => {
    const load = async () => {
      const data = await getAppointmentsByStudent(STUDENT_ID);
      setAppointments(data);
      setLoading(false);
    };
    load();
  }, []);

  const filterByTab = (tab: TabKey): Appointment[] => {
    if (tab === "all") return appointments;
    if (tab === "pending")
      return appointments.filter((a) => a.status === "pending");
    if (tab === "upcoming")
      return appointments.filter(
        (a) =>
          ["pending", "approved", "rescheduled"].includes(a.status) &&
          new Date(a.date) >= new Date(),
      );
    if (tab === "completed")
      return appointments.filter((a) => a.status === "completed");
    return appointments.filter((a) => ["cancelled", "rejected", "no-show"].includes(a.status));
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    setCancelling(true);
    await updateAppointmentStatus(cancelId, "cancelled", "Cancelled by student");
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === cancelId ? { ...a, status: "cancelled" as AppointmentStatus } : a,
      ),
    );
    setCancelling(false);
    setCancelId(null);
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="My Appointments" />
        <LoadingState rows={5} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My Appointments"
        description="View and manage your consultation appointments."
        action={
          <Button asChild>
            <Link href="/student/appointments/new">
              <CalendarPlus className="mr-2 h-4 w-4" />
              Book Consultation
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="all" className="mt-6">
        <TabsList className="flex w-full flex-wrap justify-start overflow-x-auto sm:w-auto">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
              <span className="ml-1 text-muted-foreground">
                ({filterByTab(tab.key).length})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => {
          const items = filterByTab(tab.key);
          return (
            <TabsContent key={tab.key} value={tab.key} className="mt-4">
              {items.length === 0 ? (
                <EmptyState
                  title={`No ${tab.label.toLowerCase()} appointments`}
                  description={
                    tab.key === "all"
                      ? "Book your first consultation to get started."
                      : "Appointments in this category will appear here."
                  }
                  action={
                    <Button variant="outline" asChild>
                      <Link href="/student/lecturers">Find a Lecturer</Link>
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {items.map((appt) => (
                    <Card key={appt.id}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold">
                              {getLecturerName(appt.lecturerId)}
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {getCourseName(appt.courseId)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <StatusBadge status={appt.status} />
                            <Badge variant="outline">
                              {appt.type === "online" ? "Online" : "In-person"}
                            </Badge>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                          <p className="flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                            {formatDate(appt.date)}
                          </p>
                          <p className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            {formatTime(appt.startTime)} - {formatTime(appt.endTime)}
                          </p>
                          {appt.location && (
                            <p className="flex items-center gap-1.5 sm:col-span-2">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              {appt.location}
                            </p>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/student/appointments/${appt.id}`}>
                              View
                              <ArrowRight className="ml-2 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          {["pending", "approved", "rescheduled"].includes(appt.status) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => router.push(`/student/appointments/${appt.id}?reschedule=1`)}
                            >
                              Reschedule
                            </Button>
                          )}
                          {["pending", "approved", "rescheduled"].includes(appt.status) && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setCancelId(appt.id)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <ConfirmationDialog
        open={!!cancelId}
        onOpenChange={(open) => !open && setCancelId(null)}
        title="Cancel appointment?"
        description="Are you sure you want to cancel this appointment? This action cannot be undone."
        confirmLabel="Cancel appointment"
        variant="destructive"
        onConfirm={handleCancel}
        loading={cancelling}
      />
    </div>
  );
}
