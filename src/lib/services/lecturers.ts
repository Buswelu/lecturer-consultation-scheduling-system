import { getSupabase } from "@/lib/supabase/client";
import { lecturers } from "@/lib/mock-data";
import { departments } from "@/lib/mock-data";
import { courses } from "@/lib/mock-data";
import type { LecturerProfile } from "@/lib/types";

const IS_MOCK = true;

export interface LecturerFilters {
  search?: string;
  departmentId?: string;
  courseId?: string;
  availableOnly?: boolean;
}

export async function getLecturers(filters?: LecturerFilters): Promise<LecturerProfile[]> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      let query = supabase.from("profiles").select("*").eq("role", "lecturer").eq("status", "active");
      if (filters?.departmentId) query = query.eq("department_id", filters.departmentId);
      const { data, error } = await query;
      if (error) throw error;
      return data as LecturerProfile[];
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
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();
      if (error) return null;
      return data as LecturerProfile;
    }
  }
  return lecturers.find((l) => l.id === id) ?? null;
}

export function getLecturerName(id: string): string {
  return lecturers.find((l) => l.id === id)?.fullName ?? "Unknown Lecturer";
}

export function getDepartmentName(id: string): string {
  return departments.find((d) => d.id === id)?.name ?? "Unknown Department";
}

export function getCourseName(id: string): string {
  return courses.find((c) => c.id === id)?.title ?? "Unknown Course";
}
