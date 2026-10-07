/**
 * LCSS — reports repository: controlled aggregates (server-only).
 *
 * Everything is COUNT()/GROUP BY in SQL — never load full tables into JS.
 * Admin-only entry points (routes enforce `requirePgRole("admin")`).
 */
import "server-only";
import { getPool } from "@/lib/db/pool";

export interface ReportsSummary {
  appointmentsByStatus: Record<string, number>;
  appointmentsByType: { inPerson: number; online: number };
  appointmentsByMonth: { month: string; count: number }[];
  topCourses: { courseId: string; courseName: string; count: number }[];
  appointmentsByDepartment: { departmentId: string; departmentName: string; count: number }[];
  lecturerStats: { lecturerId: string; lecturerName: string; total: number; completed: number; cancelled: number; noShow: number }[];
  studentStats: { studentId: string; studentName: string; total: number; completed: number; cancelled: number; noShow: number }[];
  totals: { appointments: number; completed: number; cancelled: number; noShow: number };
}

export async function reportsSummary(): Promise<ReportsSummary> {
  const pool = getPool();
  const [byStatus, byDept, byLecturer, byStudent, byMonth, byType, byTopCourses] = await Promise.all([
    pool.query<{ status: string; count: string }>(
      "select status, count(*) as count from public.appointments group by status",
    ),
    pool.query<{ department_id: string; department_name: string; count: string }>(
      `select d.id as department_id, d.name as department_name, count(a.id) as count
         from public.departments d
         left join public.lecturers l on l.department_id = d.id
         left join public.appointments a on a.lecturer_id = l.id
        group by d.id, d.name order by d.name`,
    ),
    pool.query<{ lecturer_id: string; lecturer_name: string; total: string; completed: string; cancelled: string; no_show: string }>(
      `select l.id as lecturer_id, p.full_name as lecturer_name,
              count(a.id) as total,
              count(*) filter (where a.status = 'completed') as completed,
              count(*) filter (where a.status = 'cancelled') as cancelled,
              count(*) filter (where a.status = 'no_show') as no_show
         from public.lecturers l
         join public.profiles p on p.id = l.profile_id
         left join public.appointments a on a.lecturer_id = l.id
        group by l.id, p.full_name order by p.full_name`,
    ),
    pool.query<{ student_id: string; student_name: string; total: string; completed: string; cancelled: string; no_show: string }>(
      `select s.id as student_id, p.full_name as student_name,
              count(a.id) as total,
              count(*) filter (where a.status = 'completed') as completed,
              count(*) filter (where a.status = 'cancelled') as cancelled,
              count(*) filter (where a.status = 'no_show') as no_show
         from public.students s
         join public.profiles p on p.id = s.profile_id
         left join public.appointments a on a.student_id = s.id
        group by s.id, p.full_name order by p.full_name`,
    ),
    pool.query<{ month: string; count: string }>(
      `select to_char(a.start_datetime at time zone 'Africa/Dar_es_Salaam', 'YYYY-MM') as month,
              count(*) as count
         from public.appointments a
        group by 1 order by 1 desc limit 6`,
    ),
    pool.query<{ in_person: string; online: string }>(
      `select count(*) filter (where consultation_type = 'in_person') as in_person,
              count(*) filter (where consultation_type = 'online') as online
         from public.appointments`,
    ),
    pool.query<{ course_id: string; course_name: string; count: string }>(
      `select c.id as course_id, c.name as course_name, count(a.id) as count
         from public.courses c
         left join public.appointments a on a.course_id = c.id
        group by c.id, c.name order by count desc, c.name limit 5`,
    ),
  ]);
  const appointmentsByStatus: Record<string, number> = {};
  for (const row of byStatus.rows) appointmentsByStatus[row.status] = Number(row.count);
  const sum = (key: string): number =>
    byLecturer.rows.reduce((acc, r) => acc + Number((r as Record<string, string>)[key] ?? 0), 0);
  return {
    appointmentsByStatus,
    appointmentsByType: {
      inPerson: Number(byType.rows[0]?.in_person ?? 0),
      online: Number(byType.rows[0]?.online ?? 0),
    },
    appointmentsByMonth: [...byMonth.rows]
      .reverse()
      .map((r) => ({ month: r.month, count: Number(r.count) })),
    topCourses: byTopCourses.rows.map((r) => ({
      courseId: r.course_id,
      courseName: r.course_name,
      count: Number(r.count),
    })),
    appointmentsByDepartment: byDept.rows.map((r) => ({
      departmentId: r.department_id,
      departmentName: r.department_name,
      count: Number(r.count),
    })),
    lecturerStats: byLecturer.rows.map((r) => ({
      lecturerId: r.lecturer_id,
      lecturerName: r.lecturer_name,
      total: Number(r.total),
      completed: Number(r.completed),
      cancelled: Number(r.cancelled),
      noShow: Number(r.no_show),
    })),
    studentStats: byStudent.rows.map((r) => ({
      studentId: r.student_id,
      studentName: r.student_name,
      total: Number(r.total),
      completed: Number(r.completed),
      cancelled: Number(r.cancelled),
      noShow: Number(r.no_show),
    })),
    totals: {
      appointments: sum("total"),
      completed: sum("completed"),
      cancelled: sum("cancelled"),
      noShow: sum("no_show"),
    },
  };
}
