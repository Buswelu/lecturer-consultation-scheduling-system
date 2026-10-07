/**
 * LCSS — users/admin-directory service (PostgreSQL-backed fetch client).
 *
 * Reference-data helpers re-export from their dedicated services so existing
 * imports (`@/lib/services/users`) keep working untouched.
 */
import { apiGet, apiSend, queryString } from "./http";
import type { LecturerProfile, StudentProfile, UserRole } from "@/lib/types";

export { getDepartments, getActiveDepartments, getDepartmentById } from "./departments";
export { createDepartment, updateDepartment, deleteDepartment } from "./departments";
export { getCourses, getCourseById, getCoursesByLecturer, createCourse, updateCourse, assignLecturerToCourse, unassignLecturerFromCourse } from "./courses";
export type { CourseFilters, CourseInput, CourseUpdateInput } from "./courses";

export interface UserFilters {
  search?: string;
  role?: UserRole;
  status?: string;
  departmentId?: string;
}

export interface UserPage {
  items: UserWithDepartment[];
  total: number;
  page: number;
  pageSize: number;
}

export type UserWithDepartment =
  | (StudentProfile & { departmentName?: string })
  | (LecturerProfile & { departmentName?: string });

interface DirectoryItem {
  id: string;
  fullName: string;
  email: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  status: "active" | "inactive";
  entityId: string | null;
  departmentId: string | null;
  departmentName?: string | null;
  createdAt: string;
}

/**
 * Admin user directory (safe fields only — never hashes or tokens).
 * Maps directory rows onto the established user shapes (entity ids for
 * students/lecturers, profile id for admins).
 */
export async function getUsers(filters?: UserFilters): Promise<UserWithDepartment[]> {
  return (await getUsersPage(filters, 1, 500)).items;
}

/** Server-paginated directory with total count. */
export async function getUsersPage(
  filters: UserFilters | undefined,
  page: number,
  pageSize: number,
): Promise<UserPage> {
  const data = await apiGet<{
    users: DirectoryItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(
    `/api/admin/users${queryString({
      search: filters?.search,
      role: filters?.role,
      status: filters?.status,
      departmentId: filters?.departmentId,
      page: String(page),
      pageSize: String(pageSize),
    })}`,
  );
  const result = data.users.map((u) => toUserWithDepartment(u));
  return { items: result, total: data.total, page: data.page, pageSize: data.pageSize };
}

function toUserWithDepartment(u: DirectoryItem): UserWithDepartment {
  const base = {
    fullName: u.fullName,
    email: u.email,
    username: u.username,
    /** users.id for admin mutations (id itself is the entity id). */
    userId: u.id,
    phone: undefined,
    photoUrl: undefined,
    status: u.status,
    departmentId: u.departmentId ?? "",
    departmentName: u.departmentName ?? undefined,
    createdAt: u.createdAt,
  };
  if (u.role === "student") {
    return {
      ...base,
      id: u.entityId ?? u.id,
      role: "student",
      status: u.status,
      departmentId: u.departmentId ?? "",
    } as StudentProfile & { departmentName?: string };
  }
  if (u.role === "lecturer") {
    return {
      ...base,
      id: u.entityId ?? u.id,
      role: "lecturer",
      office: "",
      bio: "",
      courses: [],
      consultationTypes: ["in-person", "online"],
      departmentId: u.departmentId ?? "",
    } as LecturerProfile & { departmentName?: string };
  }
  return {
    ...base,
    id: u.id,
    role: "admin",
    office: "",
    bio: "",
    courses: [],
    consultationTypes: [],
    departmentId: u.departmentId ?? "",
  } as unknown as LecturerProfile & { departmentName?: string };
}

export async function getStudents(): Promise<(StudentProfile & { departmentName?: string })[]> {
  const users = await getUsers({ role: "student" });
  return users as (StudentProfile & { departmentName?: string })[];
}

export async function getLecturersAll(): Promise<(LecturerProfile & { departmentName?: string })[]> {
  const users = await getUsers({ role: "lecturer" });
  return users as (LecturerProfile & { departmentName?: string })[];
}

/** Activate/deactivate an account (admins only; wired to the real endpoint). */
export async function setUserActiveStatus(userId: string, isActive: boolean): Promise<void> {
  await apiSend("/api/admin/users", "PATCH", { userId, isActive });
}
