import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { isUuid } from "@/lib/scheduling/datetime";
import { mapCourse } from "@/lib/supabase/mappers";
import { courses } from "@/lib/mock-data";
import type { Course } from "@/lib/types";

const IS_MOCK = false;

function isLive(): boolean {
  return !IS_MOCK && isSupabaseConfigured();
}

function isLiveId(id: string): boolean {
  return isLive() && isUuid(id);
}

export interface CourseFilters {
  departmentId?: string;
  activeOnly?: boolean;
}

/** All courses, optionally filtered. */
export async function getCourses(filters?: CourseFilters): Promise<Course[]> {
  if (isLive()) {
    const supabase = getSupabase();
    if (supabase) {
      let query = supabase.from("courses").select("*").order("code");
      if (filters?.departmentId) query = query.eq("department_id", filters.departmentId);
      if (filters?.activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      // Attach lecturer assignments per course.
      const ids = data.map((c) => c.id);
      let assignments: { lecturer_id: string; course_id: string }[] = [];
      if (ids.length > 0) {
        const { data: rows, error: linkError } = await supabase
          .from("lecturer_courses")
          .select("lecturer_id, course_id")
          .in("course_id", ids);
        if (linkError) throw linkError;
        assignments = rows;
      }
      return data.map((c) =>
        mapCourse(
          c,
          assignments.filter((a) => a.course_id === c.id).map((a) => a.lecturer_id),
        ),
      );
    }
  }

  let result = [...courses];
  if (filters?.departmentId) {
    result = result.filter((c) => c.departmentId === filters.departmentId);
  }
  if (filters?.activeOnly) {
    result = result.filter((c) => c.status === "active");
  }
  return result;
}

/** Single course by id, or null. */
export async function getCourseById(id: string): Promise<Course | null> {
  const all = await getCourses();
  return all.find((c) => c.id === id) ?? null;
}

/** Courses assigned to a lecturer (via lecturer_courses). */
export async function getCoursesByLecturer(lecturerId: string): Promise<Course[]> {
  if (isLiveId(lecturerId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("lecturer_courses")
        .select("course_id, courses(*)")
        .eq("lecturer_id", lecturerId);
      if (error) throw error;
      const mapped: Course[] = [];
      for (const row of data ?? []) {
        if (!row.courses) continue;
        mapped.push(mapCourse(row.courses, [lecturerId]));
      }
      return mapped;
    }
  }
  return courses.filter((c) => c.lecturerIds.includes(lecturerId));
}
