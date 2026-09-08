import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  mapAdminProfile,
  mapLecturerProfile,
  mapStudentProfile,
} from "@/lib/supabase/mappers";
import { students, lecturers, departments, adminUser } from "@/lib/mock-data";
import type { StudentProfile, LecturerProfile, UserRole } from "@/lib/types";

// Re-exported from the dedicated reference-data services so existing
// imports (`@/lib/services/users`) keep working untouched.
export { getDepartments, getActiveDepartments, getDepartmentById } from "./departments";
export { getCourses, getCourseById, getCoursesByLecturer } from "./courses";
export type { CourseFilters } from "./courses";

const IS_MOCK = false;

function isLive(): boolean {
  return !IS_MOCK && isSupabaseConfigured();
}

export interface UserFilters {
  search?: string;
  role?: UserRole;
  status?: string;
  departmentId?: string;
}

export type UserWithDepartment =
  | (StudentProfile & { departmentName?: string })
  | (LecturerProfile & { departmentName?: string });

export async function getUsers(filters?: UserFilters): Promise<UserWithDepartment[]> {
  if (isLive()) {
    const supabase = getSupabase();
    if (supabase) {
      let query = supabase.from("profiles").select("*").order("full_name");
      if (filters?.role) query = query.eq("role", filters.role);
      const { data: profiles, error } = await query;
      if (error) throw error;

      const profileIds = profiles.map((p) => p.id);
      const [studentsRes, lecturersRes, linksRes, departmentsRes] = await Promise.all([
        profileIds.length > 0
          ? supabase.from("students").select("*").in("profile_id", profileIds)
          : Promise.resolve({ data: [], error: null } as const),
        profileIds.length > 0
          ? supabase.from("lecturers").select("*").in("profile_id", profileIds)
          : Promise.resolve({ data: [], error: null } as const),
        supabase.from("lecturer_courses").select("lecturer_id, course_id"),
        supabase.from("departments").select("id, name"),
      ]);
      if (studentsRes.error) throw studentsRes.error;
      if (lecturersRes.error) throw lecturersRes.error;
      if (linksRes.error) throw linksRes.error;
      if (departmentsRes.error) throw departmentsRes.error;

      const deptNames = new Map(
        (departmentsRes.data ?? []).map((d) => [d.id, d.name] as const),
      );
      const studentRows = studentsRes.data ?? [];
      const lecturerRows = lecturersRes.data ?? [];
      const links = linksRes.data ?? [];

      const result: UserWithDepartment[] = [];
      for (const profile of profiles) {
        if (profile.role === "student") {
          const row = studentRows.find((s) => s.profile_id === profile.id);
          if (!row) continue;
          const user = mapStudentProfile(profile, row);
          result.push({ ...user, departmentName: deptNames.get(user.departmentId) });
        } else if (profile.role === "lecturer") {
          const row = lecturerRows.find((l) => l.profile_id === profile.id);
          if (!row) continue;
          const courseIds = links
            .filter((a) => a.lecturer_id === row.id)
            .map((a) => a.course_id);
          const user = mapLecturerProfile(profile, row, courseIds);
          result.push({ ...user, departmentName: deptNames.get(user.departmentId) });
        } else {
          const admin = mapAdminProfile(profile);
          result.push({ ...admin, departmentName: undefined });
        }
      }

      let filtered = result;

      if (filters?.search) {
        const q = filters.search.toLowerCase();
        filtered = filtered.filter(
          (u) =>
            u.fullName.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q),
        );
      }
      // Phase-2 schema has no status column; every DB user maps to "active".
      if (filters?.status && filters.status !== "active") {
        filtered = [];
      }
      if (filters?.departmentId) {
        filtered = filtered.filter((u) => u.departmentId === filters.departmentId);
      }
      return filtered;
    }
  }

  let result: (StudentProfile | LecturerProfile)[] = [...students, ...lecturers];

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  if (filters?.role) {
    result = result.filter((u) => u.role === filters.role);
  }
  if (filters?.status) {
    result = result.filter((u) => u.status === filters.status);
  }
  if (filters?.departmentId) {
    result = result.filter((u) => u.departmentId === filters.departmentId);
  }

  return result.map((u) => ({
    ...u,
    departmentName: u.departmentId ? getDepartmentName(u.departmentId) : undefined,
  }));
}

export async function getStudents(): Promise<(StudentProfile & { departmentName?: string })[]> {
  const users = await getUsers({ role: "student" });
  return users as (StudentProfile & { departmentName?: string })[];
}

export async function getLecturersAll(): Promise<(LecturerProfile & { departmentName?: string })[]> {
  const users = await getUsers({ role: "lecturer" });
  return users as (LecturerProfile & { departmentName?: string })[];
}

/** Sync mock helper used by the current UI (demo current-user + lookups). */
export function getStudentById(id: string): StudentProfile | undefined {
  return students.find((s) => s.id === id);
}

/** Sync mock helper used by the current UI. */
export function getLecturerByIdLocal(id: string): LecturerProfile | undefined {
  return lecturers.find((l) => l.id === id);
}

/** Sync mock helper used by the current UI (demo current-user). */
export function getCurrentUser(role?: UserRole): StudentProfile | LecturerProfile {
  if (role === "lecturer") return lecturers[0];
  if (role === "admin") return adminUser as unknown as StudentProfile;
  return students[0];
}

/** Sync mock helper used by the current UI. */
export function getAdminUser() {
  return adminUser;
}

/** Sync mock helper used by the current UI. */
export function getDepartmentName(id: string): string {
  return departments.find((d) => d.id === id)?.name ?? "Unknown Department";
}
