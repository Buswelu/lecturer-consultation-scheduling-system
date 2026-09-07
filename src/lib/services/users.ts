import { getSupabase } from "@/lib/supabase/client";
import { students, lecturers, departments, courses, adminUser } from "@/lib/mock-data";
import type { Department, Course, StudentProfile, LecturerProfile, UserRole } from "@/lib/types";

const IS_MOCK = true;

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
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      let query = supabase.from("profiles").select("*");
      if (filters?.role) query = query.eq("role", filters.role);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.departmentId) query = query.eq("department_id", filters.departmentId);
      const { data, error } = await query;
      if (error) throw error;
      return data as UserWithDepartment[];
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

export function getStudentById(id: string): StudentProfile | undefined {
  return students.find((s) => s.id === id);
}

export function getLecturerByIdLocal(id: string): LecturerProfile | undefined {
  return lecturers.find((l) => l.id === id);
}

export function getCurrentUser(role?: UserRole): StudentProfile | LecturerProfile {
  if (role === "lecturer") return lecturers[0];
  if (role === "admin") return adminUser as unknown as StudentProfile;
  return students[0];
}

export function getAdminUser() {
  return adminUser;
}

export function getDepartmentName(id: string): string {
  return departments.find((d) => d.id === id)?.name ?? "Unknown Department";
}

export async function getDepartments(): Promise<Department[]> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase.from("departments").select("*");
      if (error) throw error;
      return data as Department[];
    }
  }
  return departments;
}

export async function getCourses(): Promise<Course[]> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase.from("courses").select("*");
      if (error) throw error;
      return data as Course[];
    }
  }
  return courses;
}
