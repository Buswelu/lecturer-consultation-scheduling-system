import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { isUuid } from "@/lib/scheduling/datetime";
import { mapDepartment } from "@/lib/supabase/mappers";
import { departments } from "@/lib/mock-data";
import type { Department } from "@/lib/types";

const IS_MOCK = false;

function isLive(): boolean {
  return !IS_MOCK && isSupabaseConfigured();
}

function isLiveId(id: string): boolean {
  return isLive() && isUuid(id);
}

/** All departments (reference data). */
export async function getDepartments(): Promise<Department[]> {
  if (isLive()) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .order("name");
      if (error) throw error;
      return data.map(mapDepartment);
    }
  }
  return departments;
}

/** Departments flagged active (for dropdowns / filters). */
export async function getActiveDepartments(): Promise<Department[]> {
  const all = await getDepartments();
  return all.filter((d) => d.status === "active");
}

/** Single department by id, or null. */
export async function getDepartmentById(id: string): Promise<Department | null> {
  if (isLiveId(id)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .eq("id", id)
        .single();
      if (error) return null;
      return mapDepartment(data);
    }
  }
  return departments.find((d) => d.id === id) ?? null;
}
