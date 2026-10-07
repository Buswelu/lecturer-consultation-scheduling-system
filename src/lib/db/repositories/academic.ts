/**
 * LCSS — academic repository: departments + courses + assignments (server-only).
 *
 * Reads are authenticated-only (any signed-in role). Writes: admins manage
 * everything; lecturers may create courses and edit courses assigned to them
 * plus self-assign/unassign (mirrors the former RLS lecturer policies).
 */
import "server-only";
import { getPool } from "@/lib/db/pool";
import { queryOne } from "@/lib/db/query";
import { mapCourse, mapDepartment } from "@/lib/db/mappers";
import type { Course, Department } from "@/lib/types";
import type { Actor, CoursesRow, DepartmentsRow } from "./types";
import { ForbiddenError } from "./types";

export async function listDepartments(): Promise<Department[]> {
  const { rows } = await getPool().query<DepartmentsRow>(
    "select * from public.departments order by name",
  );
  return rows.map(mapDepartment);
}

export async function getDepartment(id: string): Promise<Department | null> {
  const row = await queryOne<DepartmentsRow>(
    "select * from public.departments where id = $1",
    [id],
  );
  return row ? mapDepartment(row) : null;
}

function requireAdmin(actor: Actor): void {
  if (actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

export async function createDepartment(
  actor: Actor,
  input: { name: string; code?: string; description?: string },
): Promise<Department> {
  requireAdmin(actor);
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Department name must be at least 2 characters.");
  try {
    const row = await queryOne<DepartmentsRow>(
      `insert into public.departments (name, code, description)
       values ($1, nullif($2, ''), nullif($3, '')) returning *`,
      [name, input.code?.trim() || "", input.description?.trim() || ""],
    );
    if (!row) throw new Error("Could not create the department.");
    return mapDepartment(row);
  } catch (err) {
    throw friendlyConstraint(err, "A department with this name or code already exists.");
  }
}

export async function updateDepartment(
  actor: Actor,
  id: string,
  input: { name?: string; code?: string | null; description?: string | null; isActive?: boolean },
): Promise<Department> {
  requireAdmin(actor);
  try {
    const row = await queryOne<DepartmentsRow>(
      `update public.departments set
         name = coalesce(nullif($2, ''), name),
         code = coalesce(nullif($3, ''), code),
         description = coalesce($4, description),
         is_active = coalesce($5, is_active)
       where id = $1 returning *`,
      [
        id,
        input.name?.trim() ?? "",
        input.code === undefined ? undefined : input.code?.trim() || null,
        input.description === undefined ? undefined : input.description?.trim() || null,
        input.isActive ?? null,
      ],
    );
    if (!row) throw new Error("Department not found.");
    return mapDepartment(row);
  } catch (err) {
    throw friendlyConstraint(err, "A department with this name or code already exists.");
  }
}

export async function deleteDepartment(actor: Actor, id: string): Promise<void> {
  requireAdmin(actor);
  await getPool().query("delete from public.departments where id = $1", [id]);
}

export interface CourseFilters {
  departmentId?: string;
  activeOnly?: boolean;
  lecturerId?: string;
}

async function courseAssignments(courseIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (courseIds.length === 0) return map;
  const { rows } = await getPool().query<{ course_id: string; lecturer_id: string }>(
    "select course_id, lecturer_id from public.lecturer_courses where course_id = any($1)",
    [courseIds],
  );
  for (const row of rows) {
    const list = map.get(row.course_id) ?? [];
    list.push(row.lecturer_id);
    map.set(row.course_id, list);
  }
  return map;
}

export async function listCourses(filters?: CourseFilters): Promise<Course[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters?.departmentId) {
    params.push(filters.departmentId);
    conditions.push(`c.department_id = $${params.length}`);
  }
  if (filters?.activeOnly) conditions.push("c.is_active");
  if (filters?.lecturerId) {
    params.push(filters.lecturerId);
    conditions.push(
      `exists (select 1 from public.lecturer_courses lc where lc.course_id = c.id and lc.lecturer_id = $${params.length})`,
    );
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const { rows } = await getPool().query<CoursesRow>(
    `select c.* from public.courses c ${where} order by c.code`,
    params as never[],
  );
  const assignments = await courseAssignments(rows.map((r) => r.id));
  return rows.map((r) => mapCourse(r, assignments.get(r.id) ?? []));
}

export async function getCourse(id: string): Promise<Course | null> {
  const row = await queryOne<CoursesRow>("select * from public.courses where id = $1", [id]);
  if (!row) return null;
  const assignments = await courseAssignments([row.id]);
  return mapCourse(row, assignments.get(row.id) ?? []);
}

async function lecturerOwnsCourse(actor: Actor, courseId: string): Promise<boolean> {
  if (actor.role === "admin" || !actor.lecturerId) return actor.role === "admin";
  const row = await queryOne<{ one: number }>(
    "select 1 as one from public.lecturer_courses where course_id = $1 and lecturer_id = $2",
    [courseId, actor.lecturerId],
  );
  return Boolean(row);
}

export async function createCourseAs(
  actor: Actor,
  input: { title: string; code: string; departmentId: string; description?: string; credits?: number },
  lecturerId?: string,
): Promise<Course> {
  const title = input.title.trim();
  const code = input.code.trim();
  if (title.length < 2) throw new Error("Course title must be at least 2 characters.");
  if (code.length < 2) throw new Error("Course code must be at least 2 characters.");
  if (!input.departmentId) throw new Error("Select a department.");
  const credits = input.credits ?? 3;
  if (!Number.isInteger(credits) || credits < 1 || credits > 12) {
    throw new Error("Credits must be a whole number between 1 and 12.");
  }

  // Lecturers always scope to themselves (spoofed ids ignored); admins may
  // pass any lecturer id.
  const ownerId = actor.role === "lecturer" ? actor.lecturerId : (lecturerId ?? actor.lecturerId);
  if (actor.role !== "admin" && actor.role !== "lecturer") {
    throw new ForbiddenError();
  }
  try {
    const row = await queryOne<CoursesRow>(
      `insert into public.courses (code, name, description, department_id, is_active, credits)
       values ($1, $2, nullif($3, ''), $4, true, $5) returning *`,
      [code, title, input.description?.trim() || "", input.departmentId, credits],
    );
    if (!row) throw new Error("Could not create the course.");
    let assigned: string[] = [];
    if (ownerId) {
      await getPool().query(
        `insert into public.lecturer_courses (lecturer_id, course_id) values ($1, $2)
         on conflict do nothing`,
        [ownerId, row.id],
      );
      assigned = [ownerId];
    }
    return mapCourse(row, assigned);
  } catch (err) {
    throw friendlyConstraint(err, "A course with this code already exists.");
  }
}

export async function updateCourseAs(
  actor: Actor,
  id: string,
  input: { title?: string; code?: string; departmentId?: string; description?: string | null; isActive?: boolean; credits?: number },
): Promise<Course> {
  if (actor.role !== "admin" && !(await lecturerOwnsCourse(actor, id))) {
    throw new ForbiddenError();
  }
  if (input.credits !== undefined && (!Number.isInteger(input.credits) || input.credits < 1 || input.credits > 12)) {
    throw new Error("Credits must be a whole number between 1 and 12.");
  }
  try {
    const row = await queryOne<CoursesRow>(
      `update public.courses set
         name = coalesce(nullif($2, ''), name),
         code = coalesce(nullif($3, ''), code),
         department_id = coalesce($4, department_id),
         description = coalesce($5, description),
         is_active = coalesce($6, is_active),
         credits = coalesce($7, credits)
       where id = $1 returning *`,
      [
        id,
        input.title?.trim() ?? "",
        input.code?.trim() ?? "",
        input.departmentId ?? null,
        input.description === undefined ? null : input.description?.trim() || null,
        input.isActive ?? null,
        input.credits ?? null,
      ],
    );
    if (!row) throw new Error("Course not found.");
    const assignments = await courseAssignments([row.id]);
    return mapCourse(row, assignments.get(row.id) ?? []);
  } catch (err) {
    throw friendlyConstraint(err, "A course with this code already exists.");
  }
}

/** Self-assign (lecturers) or assign anyone (admins). Idempotent. */
export async function assignCourse(actor: Actor, courseId: string, lecturerId: string): Promise<void> {
  const effective =
    actor.role === "lecturer" ? actor.lecturerId : lecturerId;
  if (!effective) throw new Error("No lecturer to assign.");
  if (actor.role !== "admin" && actor.role !== "lecturer") {
    throw new ForbiddenError();
  }
  const course = await queryOne<{ id: string }>("select id from public.courses where id = $1", [
    courseId,
  ]);
  if (!course) throw new Error("Course not found.");
  const lecturer = await queryOne<{ id: string }>(
    "select id from public.lecturers where id = $1",
    [effective],
  );
  if (!lecturer) throw new Error("Lecturer not found.");
  await getPool().query(
    `insert into public.lecturer_courses (lecturer_id, course_id) values ($1, $2)
     on conflict do nothing`,
    [effective, courseId],
  );
}

export async function unassignCourse(actor: Actor, courseId: string, lecturerId: string): Promise<void> {
  const effective = actor.role === "lecturer" ? actor.lecturerId : lecturerId;
  if (!effective) throw new Error("No lecturer to unassign.");
  if (actor.role !== "admin" && actor.role !== "lecturer") {
    throw new ForbiddenError();
  }
  await getPool().query(
    "delete from public.lecturer_courses where lecturer_id = $1 and course_id = $2",
    [effective, courseId],
  );
}

function friendlyConstraint(err: unknown, duplicateMessage: string): Error {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  const message = err instanceof Error ? err.message : "";
  if (code === "23505" || /duplicate|unique/i.test(message)) return new Error(duplicateMessage);
  if (message) return err instanceof Error ? err : new Error(message);
  return new Error("Could not save the record.");
}
