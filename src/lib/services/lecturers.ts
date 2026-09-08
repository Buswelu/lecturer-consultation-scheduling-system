import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { isUuid } from "@/lib/scheduling/datetime";
import { mapLecturerProfile } from "@/lib/supabase/mappers";
import { lecturers } from "@/lib/mock-data";
import { departments } from "@/lib/mock-data";
import { courses } from "@/lib/mock-data";
import type { LecturerProfile } from "@/lib/types";

const IS_MOCK = false;

function isLive(): boolean {
  return !IS_MOCK && isSupabaseConfigured();
}

function isLiveId(id: string): boolean {
  return isLive() && isUuid(id);
}

export interface LecturerFilters {
  search?: string;
  departmentId?: string;
  courseId?: string;
  availableOnly?: boolean;
}

export async function getLecturers(filters?: LecturerFilters): Promise<LecturerProfile[]> {
  if (isLive()) {
    const supabase = getSupabase();
    if (supabase) {
      let query = supabase.from("lecturers").select("*, profiles(*)");
      if (filters?.departmentId) {
        query = query.eq("department_id", filters.departmentId);
      }
      let lecturerIds: string[] | null = null;
      if (filters?.courseId) {
        const { data: links, error: linkError } = await supabase
          .from("lecturer_courses")
          .select("lecturer_id")
          .eq("course_id", filters.courseId);
        if (linkError) throw linkError;
        lecturerIds = (links ?? []).map((l) => l.lecturer_id);
        if (lecturerIds.length === 0) return [];
        query = query.in("id", lecturerIds);
      }
      const { data, error } = await query;
      if (error) throw error;

      const rows = data ?? [];
      const { data: links, error: allLinksError } = await supabase
        .from("lecturer_courses")
        .select("lecturer_id, course_id")
        .in(
          "lecturer_id",
          rows.map((r) => r.id),
        );
      if (allLinksError) throw allLinksError;

      let result: LecturerProfile[] = [];
      for (const row of rows) {
        if (!row.profiles) continue;
        const courseIds = (links ?? [])
          .filter((a) => a.lecturer_id === row.id)
          .map((a) => a.course_id);
        result.push(mapLecturerProfile(row.profiles, row, courseIds));
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        result = result.filter(
          (l) =>
            l.fullName.toLowerCase().includes(q) ||
            (l.bio ?? "").toLowerCase().includes(q),
        );
      }
      // `availableOnly` needs live slot computation (Phase 3); accepted and
      // ignored here so the signature stays stable.
      return result;
    }
  }

  let result = lecturers.filter((l) => l.status === "active");

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (l) => l.fullName.toLowerCase().includes(q) || (l.bio ?? "").toLowerCase().includes(q),
    );
  }
  if (filters?.departmentId) {
    result = result.filter((l) => l.departmentId === filters.departmentId);
  }
  if (filters?.courseId) {
    result = result.filter((l) => l.courses.includes(filters.courseId!));
  }
  return result;
}

export async function getLecturerById(id: string): Promise<LecturerProfile | null> {
  if (isLiveId(id)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("lecturers")
        .select("*, profiles(*)")
        .eq("id", id)
        .single();
      if (error || !data || !data.profiles) return null;
      const { data: links, error: linkError } = await supabase
        .from("lecturer_courses")
        .select("course_id")
        .eq("lecturer_id", id);
      if (linkError) throw linkError;
      return mapLecturerProfile(
        data.profiles,
        data,
        (links ?? []).map((l) => l.course_id),
      );
    }
  }
  return lecturers.find((l) => l.id === id) ?? null;
}

/** Lecturer entity id for a given auth/profile id. */
export async function getLecturerIdByProfileId(
  profileId: string,
): Promise<string | null> {
  if (isLiveId(profileId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("lecturers")
        .select("id")
        .eq("profile_id", profileId)
        .single();
      if (error || !data) return null;
      return data.id;
    }
  }
  return lecturers.find((l) => l.id === profileId)?.id ?? null;
}

/** Sync mock helpers used by the current UI. */
export function getLecturerName(id: string): string {
  return lecturers.find((l) => l.id === id)?.fullName ?? "Unknown Lecturer";
}

/** Sync mock helper used by the current UI. */
export function getDepartmentName(id: string): string {
  return departments.find((d) => d.id === id)?.name ?? "Unknown Department";
}

/** Sync mock helper used by the current UI. */
export function getCourseName(id: string): string {
  return courses.find((c) => c.id === id)?.title ?? "Unknown Course";
}
