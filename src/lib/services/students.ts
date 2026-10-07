/**
 * LCSS — students service (PostgreSQL-backed fetch client).
 *
 * Reads are scoped server-side (owner, counterparty lecturer, admin).
 */
import { apiGet, queryString } from "./http";
import type { StudentProfile } from "@/lib/types";

export interface StudentFilters {
  search?: string;
  departmentId?: string;
}

/** All students (admin directory). */
export async function getStudents(filters?: StudentFilters): Promise<StudentProfile[]> {
  const data = await apiGet<{ students: StudentProfile[] }>(
    `/api/admin/students${queryString({
      search: filters?.search,
      departmentId: filters?.departmentId,
    })}`,
  );
  return data.students;
}

/** Single student (owner, counterparty lecturer, or admin), or null. */
export async function getStudentByIdAsync(
  id: string,
): Promise<StudentProfile | null> {
  const data = await apiGet<{ student: StudentProfile }>(
    `/api/students/${encodeURIComponent(id)}`,
  ).catch(() => null);
  return data?.student ?? null;
}

/** Student entity id for a given auth/profile id. */
export async function getStudentIdByProfileId(
  profileId: string,
): Promise<string | null> {
  const me = await apiGet<{
    id: string;
    studentId: string | null;
  }>("/api/pg-auth/me").catch(() => null);
  if (me && me.id === profileId) return me.studentId;
  return null;
}
