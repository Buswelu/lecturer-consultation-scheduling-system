import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { getCurrentLecturer, getCurrentProfile } from "@/lib/supabase/auth";
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

export interface CourseInput {
  title: string;
  code: string;
  departmentId: string;
  description?: string;
}

export interface CourseUpdateInput {
  title?: string;
  code?: string;
  departmentId?: string;
  description?: string;
  isActive?: boolean;
}

function friendlyCourseError(error: { message: string; code?: string }): Error {
  const msg = error.message.toLowerCase();
  if (error.code === "23505" || msg.includes("duplicate") || msg.includes("unique")) {
    return new Error("A course with this code already exists.");
  }
  return new Error(error.message || "Could not save the course.");
}

/**
 * Resolve which lecturer id a course mutation acts for.
 * Lecturers may only act for themselves; admins may pass any lecturer id.
 */
async function resolveCourseLecturer(requestedId?: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return requestedId ?? null;
  const [currentLecturer, profile] = await Promise.all([
    getCurrentLecturer().catch(() => null),
    getCurrentProfile().catch(() => null),
  ]);
  if (currentLecturer) {
    // Lecturer flow: always scope to self, ignore any spoofed id.
    return currentLecturer.lecturer.id;
  }
  if (profile?.role === "admin") return requestedId ?? null;
  return requestedId ?? null;
}

/**
 * Create a course and assign it to a lecturer so students can see it
 * (courses + lecturer_courses are readable by every authenticated user).
 * Live mode persists to Supabase; otherwise falls back to the mock store.
 */
export async function createCourse(
  input: CourseInput,
  lecturerId?: string,
): Promise<Course> {
  const title = input.title.trim();
  const code = input.code.trim();
  if (title.length < 2) throw new Error("Course title must be at least 2 characters.");
  if (code.length < 2) throw new Error("Course code must be at least 2 characters.");
  if (!input.departmentId) throw new Error("Select a department.");

  const ownerLecturerId = await resolveCourseLecturer(lecturerId);

  if (isLive()) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("courses")
        .insert({
          code,
          name: title,
          description: input.description?.trim() || null,
          department_id: input.departmentId,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw friendlyCourseError(error);

      let assignedIds: string[] = [];
      if (ownerLecturerId && isUuid(ownerLecturerId)) {
        const { error: linkError } = await supabase
          .from("lecturer_courses")
          .insert({ lecturer_id: ownerLecturerId, course_id: data.id });
        if (linkError) {
          // Course exists but self-assign was denied (RLS). Surface clearly.
          throw new Error(
            "Course was created but could not be assigned to you. Please contact an administrator.",
          );
        }
        assignedIds = [ownerLecturerId];
      }
      return mapCourse(data, assignedIds);
    }
  }

  const now = new Date().toISOString();
  const created: Course = {
    id: `course-${Date.now()}`,
    title,
    code,
    departmentId: input.departmentId,
    lecturerIds: ownerLecturerId ?? lecturerId ? [((ownerLecturerId ?? lecturerId) as string)] : [],
    description: input.description?.trim() || undefined,
    status: "active",
    createdAt: now,
  };
  courses.push(created);
  return created;
}

/** Update a course's details (lecturers may edit courses assigned to them). */
export async function updateCourse(id: string, input: CourseUpdateInput): Promise<Course> {
  if (isLiveId(id)) {
    const supabase = getSupabase();
    if (supabase) {
      const patch: {
        name?: string;
        code?: string;
        department_id?: string;
        description?: string | null;
        is_active?: boolean;
      } = {};
      if (input.title !== undefined) patch.name = input.title.trim();
      if (input.code !== undefined) patch.code = input.code.trim();
      if (input.departmentId !== undefined) patch.department_id = input.departmentId;
      if (input.description !== undefined)
        patch.description = input.description.trim() || null;
      if (input.isActive !== undefined) patch.is_active = input.isActive;

      const { data, error } = await supabase
        .from("courses")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw friendlyCourseError(error);

      const { data: links } = await supabase
        .from("lecturer_courses")
        .select("lecturer_id")
        .eq("course_id", id);
      return mapCourse(
        data,
        (links ?? []).map((l) => l.lecturer_id),
      );
    }
  }

  const index = courses.findIndex((c) => c.id === id);
  if (index < 0) throw new Error("Course not found.");
  const current = courses[index];
  const updated: Course = {
    ...current,
    title: input.title?.trim() || current.title,
    code: input.code?.trim() || current.code,
    departmentId: input.departmentId ?? current.departmentId,
    description: input.description ?? current.description,
    status: input.isActive === undefined ? current.status : input.isActive ? "active" : "inactive",
  };
  courses[index] = updated;
  return updated;
}

/** Assign a lecturer to an existing course (lecturers may only self-assign). */
export async function assignLecturerToCourse(
  courseId: string,
  lecturerId: string,
): Promise<void> {
  const ownerId = await resolveCourseLecturer(lecturerId);
  const effectiveId = ownerId ?? lecturerId;
  if (!effectiveId) throw new Error("No lecturer to assign.");

  if (isLiveId(courseId) && isUuid(effectiveId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase
        .from("lecturer_courses")
        .insert({ lecturer_id: effectiveId, course_id: courseId });
      // 23505 = already assigned — treat as success (idempotent).
      if (error && error.code !== "23505") throw new Error(error.message);
      return;
    }
  }

  const course = courses.find((c) => c.id === courseId);
  if (!course) throw new Error("Course not found.");
  if (!course.lecturerIds.includes(effectiveId)) {
    course.lecturerIds.push(effectiveId);
  }
}
