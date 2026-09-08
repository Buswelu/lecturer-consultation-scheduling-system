import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { isUuid } from "@/lib/scheduling/datetime";
import { mapStudentProfile } from "@/lib/supabase/mappers";
import { students } from "@/lib/mock-data";
import type { StudentProfile } from "@/lib/types";

const IS_MOCK = false;

function isLive(): boolean {
  return !IS_MOCK && isSupabaseConfigured();
}

function isLiveId(id: string): boolean {
  return isLive() && isUuid(id);
}

export interface StudentFilters {
  search?: string;
  departmentId?: string;
}

/**
 * All students (profile + student rows joined).
 * NOTE: `id` is the `students` row id (the FK target used by appointments).
 */
export async function getStudents(filters?: StudentFilters): Promise<StudentProfile[]> {
  if (isLive()) {
    const supabase = getSupabase();
    if (supabase) {
      let query = supabase.from("students").select("*, profiles(*)");
      if (filters?.departmentId) {
        query = query.eq("department_id", filters.departmentId);
      }
      const { data, error } = await query;
      if (error) throw error;
      const mapped: StudentProfile[] = [];
      for (const row of data ?? []) {
        if (!row.profiles) continue;
        mapped.push(mapStudentProfile(row.profiles, row));
      }
      let result = mapped;
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        result = result.filter(
          (s) =>
            s.fullName.toLowerCase().includes(q) ||
            s.email.toLowerCase().includes(q),
        );
      }
      return result;
    }
  }

  let result = [...students];
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q),
    );
  }
  if (filters?.departmentId) {
    result = result.filter((s) => s.departmentId === filters.departmentId);
  }
  return result;
}

/** Single student (by `students` row id), or null. */
export async function getStudentByIdAsync(
  id: string,
): Promise<StudentProfile | null> {
  if (isLiveId(id)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("students")
        .select("*, profiles(*)")
        .eq("id", id)
        .single();
      if (error || !data || !data.profiles) return null;
      return mapStudentProfile(data.profiles, data);
    }
  }
  return students.find((s) => s.id === id) ?? null;
}

/** Student entity id for a given auth/profile id (used by booking flows). */
export async function getStudentIdByProfileId(
  profileId: string,
): Promise<string | null> {
  if (isLiveId(profileId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("students")
        .select("id")
        .eq("profile_id", profileId)
        .single();
      if (error || !data) return null;
      return data.id;
    }
  }
  return students.find((s) => s.id === profileId)?.id ?? null;
}
