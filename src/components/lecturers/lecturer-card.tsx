"use client";

import Link from "next/link";
import { Building2, BookOpen, MapPin, Users } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDepartmentName, getCourseName } from "@/lib/services/lecturers";
import type { LecturerProfile } from "@/lib/types";

interface LecturerCardProps {
  lecturer: LecturerProfile;
  available?: boolean;
  /** Live display names (preferred when present; falls back to mock lookups). */
  departmentName?: string;
  courseNames?: string[];
}

export function LecturerCard({ lecturer, available = true, departmentName, courseNames }: LecturerCardProps) {
  const resolvedDept = departmentName ?? getDepartmentName(lecturer.departmentId);
  const resolvedCourses = courseNames ?? lecturer.courses.slice(0, 3).map(getCourseName);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Avatar src={lecturer.photoUrl} alt={lecturer.fullName} fallback={lecturer.fullName} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate font-semibold">{lecturer.fullName}</h3>
              <Badge
                variant={available ? "success" : "neutral"}
                className="shrink-0"
              >
                <span className={available ? "text-green-500" : ""}>
                  {available ? "Available" : "Unavailable"}
                </span>
              </Badge>
            </div>
            <p className="mt-1 line-clamp-1 text-sm text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              {resolvedDept}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {resolvedCourses.length > 0 && (
            <p className="flex items-start gap-1.5 text-sm">
              <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="line-clamp-2 text-muted-foreground">
                {resolvedCourses.join(", ")}
              </span>
            </p>
          )}
          {lecturer.office && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {lecturer.office}
            </p>
          )}
        </div>

        {lecturer.bio && (
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{lecturer.bio}</p>
        )}
      </CardContent>
      <CardFooter className="border-t px-6 py-3">
        <Button variant="default" size="sm" className="w-full" asChild>
          <Link href={`/student/lecturers/${lecturer.id}`}>
            <Users className="mr-2 h-4 w-4" />
            View Profile
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
