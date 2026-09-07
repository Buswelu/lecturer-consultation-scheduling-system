"use client";

import * as React from "react";
import { BookOpen, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { getLecturerById } from "@/lib/services/lecturers";
import { getCourses } from "@/lib/services/users";
import { getAppointmentsByLecturer } from "@/lib/services/appointments";
import type { Course } from "@/lib/types";

const LECTURER_ID = "lec-1";

export default function LecturerCoursesPage() {
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [apptCounts, setApptCounts] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    Promise.all([getLecturerById(LECTURER_ID), getCourses(), getAppointmentsByLecturer(LECTURER_ID)]).then(
      ([lecturer, allCourses, appts]) => {
        if (lecturer) {
          const mine = allCourses.filter((c) => c.lecturerIds.includes(LECTURER_ID));
          setCourses(mine);
          const counts: Record<string, number> = {};
          appts.forEach((a) => {
            counts[a.courseId] = (counts[a.courseId] ?? 0) + 1;
          });
          setApptCounts(counts);
        }
        setLoading(false);
      },
    );
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="My Courses" />
        <LoadingState rows={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Courses"
        description="Courses you teach and their consultation statistics."
      />

      {courses.length === 0 ? (
        <EmptyState title="No courses assigned" description="Your assigned courses will appear here." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <Badge variant="secondary">{course.code}</Badge>
                </div>
                <h3 className="mt-4 font-semibold">{course.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {course.credits} credits
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {course.description}
                </p>
                <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {apptCounts[course.id] ?? 0} consultations
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
