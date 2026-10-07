/**
 * LCSS — lecturers service (PostgreSQL-backed fetch client).
 *
 * Directory reads come from `/api/lecturers` with display names embedded
 * (department + course names joined server-side — no N+1, no mock sync
 * helpers). The removed sync helpers (`getLecturerName`, `getDepartmentName`,
 * `getCourseName`) now live on the payloads themselves.
 */
import { apiGet, queryString } from "./http";
import type { LecturerProfile } from "@/lib/types";

export interface LecturerFilters {
  search?: string;
  departmentId?: string;
  courseId?: string;
  availableOnly?: boolean;
}

export async function getLecturers(filters?: LecturerFilters): Promise<LecturerProfile[]> {
  const data = await apiGet<{ lecturers: LecturerProfile[] }>(
    `/api/lecturers${queryString({
      search: filters?.search,
      departmentId: filters?.departmentId,
      courseId: filters?.courseId,
    })}`,
  );
  return data.lecturers;
}

export async function getLecturerById(id: string): Promise<LecturerProfile | null> {
  const data = await apiGet<{ lecturer: LecturerProfile }>(
    `/api/lecturers/${encodeURIComponent(id)}`,
  ).catch(() => null);
  return data?.lecturer ?? null;
}

/** Lecturer entity id for a given auth/profile id. */
export async function getLecturerIdByProfileId(
  profileId: string,
): Promise<string | null> {
  const me = await apiGet<{
    id: string;
    lecturerId: string | null;
  }>("/api/pg-auth/me").catch(() => null);
  if (me && me.id === profileId) return me.lecturerId;
  return null;
}
