"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Building2,
  BookOpen,
  MapPin,
  Mail,
  Phone,
  CalendarPlus,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import { AvailabilityCalendar, type Slot } from "@/components/calendar/availability-calendar";
import { getLecturerById } from "@/lib/services/lecturers";
import { getAvailabilityExceptions, getAvailabilityForLecturer } from "@/lib/services/availability";
import { getAppointmentsByLecturer } from "@/lib/services/appointments";
import { getDepartments, getCourses } from "@/lib/services/users";
import type { LecturerProfile, AvailabilityRule, AvailabilityException, Appointment, Department, Course } from "@/lib/types";

export default function LecturerProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [lecturer, setLecturer] = React.useState<LecturerProfile | null>(null);
  const [rules, setRules] = React.useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = React.useState<AvailabilityException[]>([]);
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [selectedSlot, setSelectedSlot] = React.useState<Slot | null>(null);

  React.useEffect(() => {
    const load = async () => {
      try {
        const [lec, avRules, avExceptions, appts, deps, crs] = await Promise.all([
          getLecturerById(params.id),
          getAvailabilityForLecturer(params.id),
          getAvailabilityExceptions(params.id),
          getAppointmentsByLecturer(params.id),
          getDepartments(),
          getCourses(),
        ]);
        if (!lec) {
          setError(true);
        } else {
          setLecturer(lec);
          setRules(avRules);
          setExceptions(avExceptions);
          setAppointments(appts);
          setDepartments(deps);
          setCourses(crs);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div>
        <LoadingState rows={6} />
      </div>
    );
  }

  if (error || !lecturer) {
    return (
      <ErrorState
        title="Lecturer not found"
        description="We couldn't find this lecturer. They may have been removed."
        onRetry={() => window.location.reload()}
      />
    );
  }

  const deptName =
    departments.find((d) => d.id === lecturer.departmentId)?.name ??
    lecturer.departmentName ??
    "—";
  const courseNames = lecturer.courses.map(
    (id) => courses.find((c) => c.id === id)?.title ?? "—",
  );

  const bookedSlots = appointments
    .filter((a) => ["approved", "pending", "rescheduled"].includes(a.status))
    .map((a) => ({
      date: a.date,
      startTime: a.startTime,
      endTime: a.endTime,
      status: a.status === "pending" ? ("pending" as const) : ("booked" as const),
    }));

  const handleBook = () => {
    if (selectedSlot) {
      const query = new URLSearchParams({
        lecturerId: lecturer.id,
        date: selectedSlot.date,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
      });
      router.push(`/student/appointments/new?${query.toString()}`);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Lecturers", href: "/student/lecturers" },
          { label: lecturer.fullName },
        ]}
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left profile card */}
        <div className="lg:w-80 shrink-0">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <Avatar
                  src={lecturer.photoUrl}
                  alt={lecturer.fullName}
                  fallback={lecturer.fullName}
                  size="xl"
                />
                <h1 className="mt-4 text-xl font-bold">{lecturer.fullName}</h1>
                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  {deptName}
                </p>
                <Badge variant="success" className="mt-2">
                  Available for consultation
                </Badge>
              </div>

              <Separator className="my-6" />

              <div className="space-y-3 text-sm">
                {lecturer.office && (
                  <p className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{lecturer.office}</span>
                  </p>
                )}
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0" />
                  {lecturer.email}
                </p>
                {lecturer.phone && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0" />
                    {lecturer.phone}
                  </p>
                )}
              </div>

              <Separator className="my-6" />

              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <BookOpen className="h-4 w-4" />
                  Courses
                </h3>
                <div className="flex flex-wrap gap-2">
                  {courseNames.map((name) => (
                    <Badge key={name} variant="secondary">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>

              {lecturer.consultationTypes.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Video className="h-4 w-4" />
                    Consultation Types
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {lecturer.consultationTypes.map((type) => (
                      <Badge key={type} variant="outline">
                        {type === "in-person" ? "In-person" : "Online"}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right content */}
        <div className="flex-1 space-y-6 min-w-0">
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {lecturer.bio}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Consultation Availability</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select an available time slot to book a consultation
                </p>
              </div>
              <Button
                onClick={handleBook}
                disabled={!selectedSlot}
                className="shrink-0"
              >
                <CalendarPlus className="mr-2 h-4 w-4" />
                Book Consultation
              </Button>
            </CardHeader>
            <CardContent>
              <AvailabilityCalendar
                rules={rules}
                bookedSlots={bookedSlots}
                exceptions={exceptions}
                onSelectSlot={setSelectedSlot}
                selectedSlot={selectedSlot}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
