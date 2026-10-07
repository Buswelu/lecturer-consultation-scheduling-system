/**
 * LCSS — courses service (PostgreSQL-backed fetch client).
 *
 * Same contracts as before; data comes from `/api/courses`
 * (authenticated, server-authorized) instead of Supabase.
 */
import { apiGet, apiSend, queryString } from "./http";
import type { Course } from "@/lib/types";

export interface CourseFilters {
  departmentId?: string;
  activeOnly?: boolean;
  lecturerId?: string;
}

/** All courses, optionally filtered. */
export async function getCourses(filters?: CourseFilters): Promise<Course[]> {
  const data = await apiGet<{ courses: Course[] }>(
    `/api/courses${queryString({
      departmentId: filters?.departmentId,
      activeOnly: filters?.activeOnly ? "1" : undefined,
      lecturerId: filters?.lecturerId,
    })}`,
  );
  return data.courses;
}

/** Single course by id, or null. */
export async function getCourseById(id: string): Promise<Course | null> {
  const data = await apiGet<{ course: Course }>(
    `/api/courses/${encodeURIComponent(id)}`,
  ).catch(() => null);
  return data?.course ?? null;
}

/** Courses assigned to a lecturer (via lecturer_courses). */
export async function getCoursesByLecturer(lecturerId: string): Promise<Course[]> {
  return getCourses({ lecturerId });
}

export interface CourseInput {
  title: string;
  code: string;
  departmentId: string;
  description?: string;
  credits?: number;
}

export interface CourseUpdateInput {
  title?: string;
  code?: string;
  departmentId?: string;
  description?: string;
  isActive?: boolean;
  credits?: number;
}

/**
 * Create a course and assign it to a lecturer so students can see it.
 * Lecturers are scoped to themselves server-side; admins may pass any id.
 */
export async function createCourse(
  input: CourseInput,
  lecturerId?: string,
): Promise<Course> {
  const data = await apiSend<{ course: Course }>("/api/courses", "POST", {
    ...input,
    lecturerId,
  });
  return data.course;
}

/** Update a course's details (lecturers may edit courses assigned to them). */
export async function updateCourse(id: string, input: CourseUpdateInput): Promise<Course> {
  const data = await apiSend<{ course: Course }>(
    `/api/courses/${encodeURIComponent(id)}`,
    "PATCH",
    input,
  );
  return data.course;
}

/** Assign a lecturer to an existing course (lecturers may only self-assign). */
export async function assignLecturerToCourse(
  courseId: string,
  lecturerId: string,
): Promise<void> {
  await apiSend(`/api/courses/${encodeURIComponent(courseId)}/assign`, "POST", {
    lecturerId,
  });
}

/** Remove a lecturer assignment (lecturers may only self-unassign). */
export async function unassignLecturerFromCourse(
  courseId: string,
  lecturerId: string,
): Promise<void> {
  await apiSend(
    `/api/courses/${encodeURIComponent(courseId)}/assign${queryString({ lecturerId })}`,
    "DELETE",
  );
}

export function friendlyCourseError(error: { message: string; code?: string }): Error {
  const msg = error.message.toLowerCase();
  if (error.code === "23505" || msg.includes("duplicate") || msg.includes("unique")) {
    return new Error("A course with this code already exists.");
  }
  return new Error(error.message || "Could not save the course.");
}
