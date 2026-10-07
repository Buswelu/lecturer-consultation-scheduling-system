/**
 * LCSS — people repository: lecturers, students, admin directory (server-only).
 *
 * Lecturer directory is visible to every authenticated role (booking needs
 * it). Students are visible to owners, counterparty lecturers (shared
 * appointment), and admins. The admin directory additionally surfaces
 * usernames + active state for management.
 */
import "server-only";
import { getPool } from "@/lib/db/pool";
import { queryOne } from "@/lib/db/query";
import { mapLecturerProfile, mapStudentProfile } from "@/lib/db/mappers";
import type { LecturerProfile, StudentProfile } from "@/lib/types";
import type { Actor, LecturersRow, StudentsRow } from "./types";
import { ForbiddenError } from "./types";

export interface LecturerFilters {
  search?: string;
  departmentId?: string;
  courseId?: string;
}

export interface PageParams {
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Parse ?page=&pageSize= (1-based page, 1..200 size, default 50). */
export function parsePageParams(search: URLSearchParams): PageParams {
  const rawPage = Number.parseInt(search.get("page") ?? "", 10);
  const rawSize = Number.parseInt(search.get("pageSize") ?? "", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize =
    Number.isFinite(rawSize) && rawSize > 0 ? Math.min(200, Math.floor(rawSize)) : 50;
  return { page, pageSize };
}

async function lecturerCourseMap(lecturerIds: string[]): Promise<{
  courseIds: Map<string, string[]>;
  courseNames: Map<string, string[]>;
}> {
  const courseIds = new Map<string, string[]>();
  const courseNames = new Map<string, string[]>();
  if (lecturerIds.length === 0) return { courseIds, courseNames };
  const { rows } = await getPool().query<{ lecturer_id: string; course_id: string; name: string }>(
    `select lc.lecturer_id, lc.course_id, c.name
       from public.lecturer_courses lc
       join public.courses c on c.id = lc.course_id
      where lc.lecturer_id = any($1)`,
    [lecturerIds],
  );
  for (const row of rows) {
    courseIds.set(row.lecturer_id, [...(courseIds.get(row.lecturer_id) ?? []), row.course_id]);
    courseNames.set(row.lecturer_id, [...(courseNames.get(row.lecturer_id) ?? []), row.name]);
  }
  return { courseIds, courseNames };
}

export interface LecturerWithMeta extends LecturerProfile {
  departmentName?: string;
  courseNames?: string[];
}

export async function listLecturers(filters?: LecturerFilters): Promise<LecturerWithMeta[]> {
  return (await listLecturersPage(filters, undefined)).items;
}

export async function listLecturersPage(
  filters?: LecturerFilters,
  page?: PageParams,
): Promise<PageResult<LecturerWithMeta>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters?.departmentId) {
    params.push(filters.departmentId);
    conditions.push(`l.department_id = $${params.length}`);
  }
  if (filters?.courseId) {
    params.push(filters.courseId);
    conditions.push(
      `exists (select 1 from public.lecturer_courses lc where lc.lecturer_id = l.id and lc.course_id = $${params.length})`,
    );
  }
  if (filters?.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    conditions.push(
      `(lower(p.full_name) like $${params.length} or lower(coalesce(l.bio, '')) like $${params.length})`,
    );
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const from = `from public.lecturers l
       join public.profiles p on p.id = l.profile_id
       left join public.departments d on d.id = l.department_id
       ${where}`;
  const totalRow = await queryOne<{ count: string }>(
    `select count(*) as count ${from}`,
    params as never[],
  );
  const total = Number(totalRow?.count ?? 0);
  const limitOffset =
    page && page.pageSize > 0
      ? ` limit ${Math.min(200, page.pageSize)} offset ${(Math.max(1, page.page) - 1) * Math.min(200, page.pageSize)}`
      : " limit 500";
  const { rows } = await getPool().query<{
    lecturer: LecturersRow;
    profile: { id: string; full_name: string; email: string | null; phone: string | null; avatar_url: string | null };
    department_name: string | null;
  }>(
    `select to_jsonb(l) as lecturer, to_jsonb(p) as profile, d.name as department_name
       ${from}
      order by p.full_name${limitOffset}`,
    params as never[],
  );
  const { courseIds, courseNames } = await lecturerCourseMap(rows.map((r) => r.lecturer.id));
  const items = rows.map((r) => {
    const profile = mapLecturerProfile(
      {
        id: r.profile.id,
        full_name: r.profile.full_name,
        email: r.profile.email,
        phone: r.profile.phone,
        avatar_url: r.profile.avatar_url,
        role: "lecturer",
        created_at: r.lecturer.created_at,
        updated_at: r.lecturer.created_at,
      },
      r.lecturer,
      courseIds.get(r.lecturer.id) ?? [],
    );
    return {
      ...profile,
      departmentName: r.department_name ?? undefined,
      courseNames: courseNames.get(r.lecturer.id) ?? [],
    };
  });
  return { items, total, page: page?.page ?? 1, pageSize: page?.pageSize ?? items.length };
}

export async function getLecturer(id: string): Promise<LecturerWithMeta | null> {
  const row = await queryOne<{
    lecturer: LecturersRow;
    profile: { id: string; full_name: string; email: string | null; phone: string | null; avatar_url: string | null };
    department_name: string | null;
  }>(
    `select to_jsonb(l) as lecturer, to_jsonb(p) as profile, d.name as department_name
       from public.lecturers l
       join public.profiles p on p.id = l.profile_id
       left join public.departments d on d.id = l.department_id
      where l.id = $1`,
    [id],
  );
  if (!row) return null;
  const { courseIds, courseNames } = await lecturerCourseMap([row.lecturer.id]);
  const profile = mapLecturerProfile(
    {
      id: row.profile.id,
      full_name: row.profile.full_name,
      email: row.profile.email,
      phone: row.profile.phone,
      avatar_url: row.profile.avatar_url,
      role: "lecturer",
      created_at: row.lecturer.created_at,
      updated_at: row.lecturer.created_at,
    },
    row.lecturer,
    courseIds.get(row.lecturer.id) ?? [],
  );
  return {
    ...profile,
    departmentName: row.department_name ?? undefined,
    courseNames: courseNames.get(row.lecturer.id) ?? [],
  };
}

export async function lecturerIdForProfile(profileId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    "select id from public.lecturers where profile_id = $1",
    [profileId],
  );
  return row?.id ?? null;
}

export interface StudentFilters {
  search?: string;
  departmentId?: string;
}

async function canSeeStudent(actor: Actor, studentId: string): Promise<boolean> {
  if (actor.role === "admin") return true;
  if (actor.role === "student" && actor.studentId === studentId) return true;
  if (actor.role === "lecturer" && actor.lecturerId) {
    const row = await queryOne<{ one: number }>(
      `select 1 as one from public.appointments a
        where a.student_id = $1 and a.lecturer_id = $2 limit 1`,
      [studentId, actor.lecturerId],
    ).catch(() => null);
    return Boolean(row);
  }
  return false;
}

export async function listStudents(actor: Actor, filters?: StudentFilters): Promise<StudentProfile[]> {
  if (actor.role !== "admin") {
    throw new ForbiddenError();
  }
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters?.departmentId) {
    params.push(filters.departmentId);
    conditions.push(`s.department_id = $${params.length}`);
  }
  if (filters?.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    conditions.push(
      `(lower(p.full_name) like $${params.length} or lower(coalesce(p.email, '')) like $${params.length})`,
    );
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const { rows } = await getPool().query<{ student: StudentsRow; profile: ProfilesRowShape }>(
    `select to_jsonb(s) as student, to_jsonb(p) as profile
       from public.students s
       join public.profiles p on p.id = s.profile_id
       ${where}
      order by p.full_name`,
    params as never[],
  );
  return rows.map((r) =>
    mapStudentProfile(
      {
        id: r.profile.id,
        full_name: r.profile.full_name,
        email: r.profile.email,
        phone: r.profile.phone,
        avatar_url: r.profile.avatar_url,
        role: "student",
        created_at: r.student.created_at,
        updated_at: r.student.created_at,
      },
      r.student,
    ),
  );
}

interface ProfilesRowShape {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
}

export async function getStudent(actor: Actor, id: string): Promise<StudentProfile | null> {
  const row = await queryOne<{ student: StudentsRow; profile: ProfilesRowShape }>(
    `select to_jsonb(s) as student, to_jsonb(p) as profile
       from public.students s
       join public.profiles p on p.id = s.profile_id
      where s.id = $1`,
    [id],
  );
  if (!row) return null;
  if (!(await canSeeStudent(actor, row.student.id))) {
    throw new ForbiddenError();
  }
  return mapStudentProfile(
    {
      id: row.profile.id,
      full_name: row.profile.full_name,
      email: row.profile.email,
      phone: row.profile.phone,
      avatar_url: row.profile.avatar_url,
      role: "student",
      created_at: row.student.created_at,
      updated_at: row.student.created_at,
    },
    row.student,
  );
}

export async function studentIdForProfile(profileId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    "select id from public.students where profile_id = $1",
    [profileId],
  );
  return row?.id ?? null;
}

export interface DirectoryUser {
  id: string;
  fullName: string;
  email: string;
  username: string;
  role: "student" | "lecturer" | "admin";
  isActive: boolean;
  departmentId?: string;
  departmentName?: string;
  entityId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export async function adminDirectory(
  actor: Actor,
  filters?: { search?: string; role?: string; departmentId?: string; status?: string },
  page?: PageParams,
): Promise<PageResult<DirectoryUser>> {
  if (actor.role !== "admin") {
    throw new ForbiddenError();
  }
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters?.role && ["student", "lecturer", "admin"].includes(filters.role)) {
    params.push(filters.role);
    conditions.push(`p.role = $${params.length}`);
  }
  if (filters?.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    conditions.push(
      `(lower(p.full_name) like $${params.length} or lower(coalesce(u.email, '')) like $${params.length} or lower(u.username::text) like $${params.length})`,
    );
  }
  if (filters?.status === "active") conditions.push("u.is_active");
  if (filters?.status === "inactive") conditions.push("not u.is_active");
  if (filters?.departmentId) {
    params.push(filters.departmentId);
    conditions.push(`coalesce(s.department_id, l.department_id) = $${params.length}`);
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const from = `from public.profiles p
       join public.users u on u.id = p.id
       left join public.students s on s.profile_id = p.id
       left join public.lecturers l on l.profile_id = p.id
       left join public.departments d on d.id = coalesce(s.department_id, l.department_id)
       ${where}`;
  const totalRow = await queryOne<{ count: string }>(
    `select count(*) as count ${from}`,
    params as never[],
  );
  const total = Number(totalRow?.count ?? 0);
  const size = page ? Math.min(200, Math.max(1, page.pageSize)) : 500;
  const offset = page ? (Math.max(1, page.page) - 1) * size : 0;
  const { rows } = await getPool().query<{
    id: string;
    full_name: string;
    email: string;
    username: string;
    role: DirectoryUser["role"];
    is_active: boolean;
    department_id: string | null;
    department_name: string | null;
    entity_id: string | null;
    created_at: string;
    last_login_at: string | null;
  }>(
    `select p.id, p.full_name, coalesce(u.email, '') as email, u.username::text as username,
            p.role, u.is_active,
            coalesce(s.department_id, l.department_id) as department_id,
            d.name as department_name,
            coalesce(s.id, l.id) as entity_id,
            u.created_at, u.last_login_at
       ${from}
      order by p.full_name limit ${size} offset ${offset}`,
    params as never[],
  );
  const items = rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    username: r.username,
    role: r.role,
    isActive: r.is_active,
    departmentId: r.department_id ?? undefined,
    departmentName: r.department_name ?? undefined,
    entityId: r.entity_id,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
  }));
  return { items, total, page: page?.page ?? 1, pageSize: page ? size : items.length };
}
