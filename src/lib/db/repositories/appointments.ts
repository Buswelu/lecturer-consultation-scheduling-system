/**
 * LCSS — appointments repository (server-only).
 *
 * Reads embed display names via joins (no N+1). Mutations run in
 * transactions that set `app.actor_id` (audit history), enforce transitions
 * (mirroring `APPOINTMENT_TRANSITIONS`), write notifications atomically, and
 * rely on the GiST exclusion constraint as the race backstop (23P01 →
 * friendly conflict).
 */
import "server-only";
import { getPool } from "@/lib/db/pool";
import { queryOne } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import type { PoolClient } from "pg";
import {
  fromDbAppointmentStatus,
  mapAppointment,
  mapAppointmentHistoryEntry,
  toDbAppointmentStatus,
  toDbConsultationType,
} from "@/lib/db/mappers";
import type { DbAppointmentStatus } from "@/lib/db/database.types";
import {
  assertValidTimeRange,
  wallToISO,
  isUuid,
  zonedWallToUtcMs,
} from "@/lib/scheduling/datetime";
import { assertTransitionAllowed } from "@/lib/scheduling/appointment-rules";
import { BookingConflictError } from "@/lib/scheduling/slots";
import type {
  Appointment,
  AppointmentHistoryEntry,
  AppointmentStatus,
  ConsultationType,
} from "@/lib/types";
import type { Actor, AppointmentsRow } from "./types";
import { ForbiddenError } from "./types";
import { computeSlots } from "./availability";
import { insertNotificationTx } from "./notifications";

type Tx = Pick<PoolClient, "query">;

const APPOINTMENT_SELECT = `select a.*,
    lp.full_name as lecturer_name, l.id as lecturer_row_id,
    sp.full_name as student_name, s.id as student_row_id,
    c.name as course_name
  from public.appointments a
  join public.students s on s.id = a.student_id
  join public.profiles sp on sp.id = s.profile_id
  join public.lecturers l on l.id = a.lecturer_id
  join public.profiles lp on lp.id = l.profile_id
  left join public.courses c on c.id = a.course_id`;

interface AppointmentJoinedRow extends AppointmentsRow {
  lecturer_name: string;
  student_name: string;
  course_name: string | null;
}

function toDomain(row: AppointmentJoinedRow): Appointment {
  const appointment = mapAppointment(row);
  appointment.lecturerName = row.lecturer_name;
  appointment.studentName = row.student_name;
  appointment.courseName = row.course_name ?? undefined;
  return appointment;
}

async function historyFor(appointmentId: string): Promise<AppointmentHistoryEntry[]> {
  const { rows } = await getPool().query(
    "select * from public.appointment_history where appointment_id = $1 order by created_at",
    [appointmentId],
  );
  return rows.map(mapAppointmentHistoryEntry);
}

export interface AppointmentFilters {
  status?: AppointmentStatus;
  lecturerId?: string;
  courseId?: string;
  search?: string;
  departmentId?: string;
}

export interface AppointmentPage {
  items: Appointment[];
  total: number;
  page: number;
  pageSize: number;
}

function scopedConditions(
  actor: Actor,
  filters?: AppointmentFilters,
): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (actor.role === "student") {
    if (!actor.studentId) throw new Error("Student profile not found.");
    params.push(actor.studentId);
    conditions.push(`a.student_id = $${params.length}`);
  } else if (actor.role === "lecturer") {
    if (!actor.lecturerId) throw new Error("Lecturer profile not found.");
    params.push(actor.lecturerId);
    conditions.push(`a.lecturer_id = $${params.length}`);
  }
  if (filters?.status) {
    params.push(toDbAppointmentStatus(filters.status));
    conditions.push(`a.status = $${params.length}`);
  }
  if (filters?.lecturerId && isUuid(filters.lecturerId)) {
    params.push(filters.lecturerId);
    conditions.push(`a.lecturer_id = $${params.length}`);
  }
  if (filters?.courseId && isUuid(filters.courseId)) {
    params.push(filters.courseId);
    conditions.push(`a.course_id = $${params.length}`);
  }
  if (filters?.search?.trim()) {
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    conditions.push(
      `(lower(a.reason) like $${params.length} or lower(lp.full_name) like $${params.length} or lower(sp.full_name) like $${params.length})`,
    );
  }
  if (filters?.departmentId && isUuid(filters.departmentId)) {
    params.push(filters.departmentId);
    conditions.push(
      `exists (select 1 from public.courses dc where dc.id = a.course_id and dc.department_id = $${params.length})`,
    );
  }
  return { where: conditions.length > 0 ? `where ${conditions.join(" and ")}` : "", params };
}

export async function listAppointments(
  actor: Actor,
  filters?: AppointmentFilters,
): Promise<Appointment[]> {
  return (await listAppointmentsPage(actor, filters)).items;
}

export async function listAppointmentsPage(
  actor: Actor,
  filters?: AppointmentFilters,
  page?: { page: number; pageSize: number },
): Promise<AppointmentPage> {
  const { where, params } = scopedConditions(actor, filters);
  const from = `${APPOINTMENT_SELECT} ${where}`;
  // Exact total via subquery over the same scoped joins.
  const counted = await queryOne<{ count: string }>(
    `select count(*) as count from (${from}) as scoped`,
    params,
  );
  const total = Number(counted?.count ?? 0);
  const size = page ? Math.min(200, Math.max(1, page.pageSize)) : 500;
  const offset = page ? (Math.max(1, page.page) - 1) * size : 0;
  const { rows } = await getPool().query<AppointmentJoinedRow>(
    `${from} order by a.created_at desc limit ${size} offset ${offset}`,
    params as never[],
  );
  return { items: rows.map(toDomain), total, page: page?.page ?? 1, pageSize: page ? size : rows.length };
}

export async function getAppointment(
  actor: Actor,
  id: string,
): Promise<Appointment | null> {
  const { rows } = await getPool().query<AppointmentJoinedRow>(
    `${APPOINTMENT_SELECT} where a.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  if (
    actor.role !== "admin" &&
    !((actor.role === "student" && actor.studentId === row.student_id) ||
      (actor.role === "lecturer" && actor.lecturerId === row.lecturer_id))
  ) {
    throw new ForbiddenError();
  }
  const appointment = toDomain(row);
  appointment.history = await historyFor(id);
  return appointment;
}

/** EAT wall-clock label matching the legacy trigger messages. */
function timeLabel(startIso: string, endIso: string): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const fmtTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${fmt.format(new Date(startIso))} – ${fmtTime.format(new Date(endIso))} (EAT)`;
}

async function namesFor(tx: Tx, studentId: string, lecturerId: string): Promise<{ studentName: string; lecturerName: string; studentProfile: string; lecturerProfile: string }> {
  const s = await tx.query(
    `select s.id, p.id as profile_id, p.full_name from public.students s
       join public.profiles p on p.id = s.profile_id where s.id = $1`,
    [studentId],
  );
  const l = await tx.query(
    `select l.id, p.id as profile_id, p.full_name from public.lecturers l
       join public.profiles p on p.id = l.profile_id where l.id = $1`,
    [lecturerId],
  );
  return {
    studentName: s.rows[0]?.full_name ?? "A student",
    lecturerName: l.rows[0]?.full_name ?? "your lecturer",
    studentProfile: s.rows[0]?.profile_id,
    lecturerProfile: l.rows[0]?.profile_id,
  };
}

async function setActor(tx: Tx, actor: Actor): Promise<void> {
  await tx.query("select set_config('app.actor_id', $1, true)", [actor.profileId]);
}

function conflictOf(err: unknown): Error {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  if (code === "23P01") return new BookingConflictError();
  if (err instanceof Error) return err;
  return new Error("We couldn't process your request right now.");
}

export interface NewAppointmentInput {
  studentId: string;
  lecturerId: string;
  courseId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: ConsultationType;
  reason: string;
  notes?: string;
  location?: string;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) throw new Error("Invalid time slot selected.");
  return h * 60 + m;
}

async function assertSlotBookable(
  lecturerId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeAppointmentId?: string,
): Promise<void> {
  assertValidTimeRange(startTime, endTime);
  const startMs = zonedWallToUtcMs(date, minutesOf(startTime));
  if (!(startMs > Date.now())) {
    throw new Error("This time slot is in the past. Please choose another slot.");
  }
  const slots = await computeSlots({ lecturerId, from: date, to: date, excludeAppointmentId });
  const slot = (slots[date] ?? []).find(
    (s) => s.startTime === startTime && s.endTime === endTime,
  );
  if (!slot || slot.status !== "available") throw new BookingConflictError();
}

export async function createAppointmentAs(
  actor: Actor,
  input: NewAppointmentInput,
): Promise<Appointment> {
  if (input.type !== "in-person" && input.type !== "online") {
    throw new Error("Please select a valid consultation type.");
  }
  if (!input.reason || input.reason.trim().length < 5) {
    throw new Error("Please provide a reason (at least 5 characters).");
  }
  const studentId = actor.role === "student" ? actor.studentId : input.studentId;
  if (!studentId) throw new Error("You must be signed in as a student to book.");

  const pool = getPool();
  const lecturer = await queryOne<{ id: string }>("select id from public.lecturers where id = $1", [
    input.lecturerId,
  ]);
  if (!lecturer) throw new Error("The selected lecturer is no longer available.");
  const courseId: string | null = input.courseId || null;
  if (courseId) {
    const assigned = await pool.query("select 1 as one from public.lecturer_courses where lecturer_id = $1 and course_id = $2", [
      input.lecturerId,
      courseId,
    ]);
    if (assigned.rows.length === 0) {
      throw new Error("The selected course is not offered by this lecturer.");
    }
  }
  await assertSlotBookable(input.lecturerId, input.date, input.startTime, input.endTime);

  try {
    const createdId = await withTransaction(async (tx) => {
      await setActor(tx, actor);
      const res = await tx.query<{ id: string }>(
        `insert into public.appointments
           (student_id, lecturer_id, course_id, start_datetime, end_datetime,
            consultation_type, status, reason, notes, location)
         values ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9) returning id`,
        [
          studentId,
          input.lecturerId,
          courseId,
          wallToISO(input.date, input.startTime),
          wallToISO(input.date, input.endTime),
          toDbConsultationType(input.type),
          input.reason.trim(),
          input.notes?.trim() || null,
          input.location?.trim() || null,
        ],
      );
      const names = await namesFor(tx, studentId, input.lecturerId);
      const label = timeLabel(
        wallToISO(input.date, input.startTime),
        wallToISO(input.date, input.endTime),
      );
      await insertNotificationTx(tx, {
        userId: names.lecturerProfile,
        title: "New consultation request",
        message: `${names.studentName} requested a consultation on ${label}. Reason: ${input.reason.trim().slice(0, 140)}`,
        type: "request",
        appointmentId: res.rows[0].id,
      });
      await insertNotificationTx(tx, {
        userId: names.studentProfile,
        title: "Request submitted",
        message: `Your consultation request with ${names.lecturerName} on ${label} is pending review.`,
        type: "request",
        appointmentId: res.rows[0].id,
      });
      return res.rows[0].id;
    });
    const created = await getAppointment(actor, createdId);
    if (!created) throw new Error("We couldn't process your request right now.");
    return created;
  } catch (err) {
    throw conflictOf(err);
  }
}

interface LoadedAppointment {
  row: AppointmentsRow;
  status: AppointmentStatus;
}

async function loadForMutation(id: string): Promise<LoadedAppointment> {
  const row = await queryOne<AppointmentsRow>("select * from public.appointments where id = $1", [
    id,
  ]);
  if (!row) throw new Error("Appointment not found.");
  return { row, status: fromDbAppointmentStatus(row.status as DbAppointmentStatus) };
}

function requireParty(actor: Actor, row: AppointmentsRow, kind: "student" | "lecturer" | "either"): void {
  if (actor.role === "admin") return;
  const ownStudent = actor.role === "student" && actor.studentId === row.student_id;
  const ownLecturer = actor.role === "lecturer" && actor.lecturerId === row.lecturer_id;
  if (kind === "student" && !ownStudent) {
    throw new ForbiddenError();
  }
  if (kind === "lecturer" && !ownLecturer) {
    throw new ForbiddenError();
  }
  if (kind === "either" && !ownStudent && !ownLecturer) {
    throw new ForbiddenError();
  }
}

async function changeStatus(
  actor: Actor,
  id: string,
  to: AppointmentStatus,
  opts?: {
    rejectionReason?: string;
    newStartDatetime?: string;
    newEndDatetime?: string;
    fields?: { notes?: string | null; location?: string | null; meetingLink?: string | null };
  },
): Promise<Appointment> {
  const { row, status } = await loadForMutation(id);
  assertTransitionAllowed(status, to);
  try {
    await withTransaction(async (tx) => {
      await setActor(tx, actor);
      await tx.query(
        `update public.appointments set status = $2,
           rejection_reason = coalesce($3, rejection_reason),
           start_datetime = coalesce($4, start_datetime),
           end_datetime = coalesce($5, end_datetime),
           notes = coalesce($6, notes),
           location = coalesce($7, location),
           meeting_link = coalesce($8, meeting_link),
           updated_at = now()
         where id = $1`,
        [
          id,
          toDbAppointmentStatus(to),
          opts?.rejectionReason ?? null,
          opts?.newStartDatetime ?? null,
          opts?.newEndDatetime ?? null,
          opts?.fields?.notes ?? null,
          opts?.fields?.location ?? null,
          opts?.fields?.meetingLink ?? null,
        ],
      );
      await notifyForTransition(tx, actor, row, status, to, opts);
    });
    const updated = await getAppointment(actor, id);
    if (!updated) throw new Error("Appointment not found.");
    return updated;
  } catch (err) {
    throw conflictOf(err);
  }
}

async function notifyForTransition(
  tx: Tx,
  actor: Actor,
  row: AppointmentsRow,
  from: AppointmentStatus,
  to: AppointmentStatus,
  opts?: { rejectionReason?: string; newStartDatetime?: string; newEndDatetime?: string },
): Promise<void> {
  void from;
  const names = await namesFor(tx, row.student_id, row.lecturer_id);
  const startIso = opts?.newStartDatetime ?? row.start_datetime;
  const endIso = opts?.newEndDatetime ?? row.end_datetime;
  const label = timeLabel(startIso, endIso);
  const student = names.studentProfile;
  const lecturer = names.lecturerProfile;
  switch (to) {
    case "approved":
      await insertNotificationTx(tx, {
        userId: student,
        title: "Consultation approved",
        message: `Your consultation with ${names.lecturerName} on ${label} has been approved.`,
        type: "approval",
        appointmentId: row.id,
      });
      break;
    case "rejected":
      await insertNotificationTx(tx, {
        userId: student,
        title: "Consultation request rejected",
        message:
          `Your consultation request with ${names.lecturerName} on ${label} was not approved.` +
          (opts?.rejectionReason ? ` Reason: ${opts.rejectionReason}` : ""),
        type: "rejection",
        appointmentId: row.id,
      });
      break;
    case "cancelled": {
      const byStudent = actor.role === "student";
      await insertNotificationTx(tx, {
        userId: byStudent ? lecturer : student,
        title: "Consultation cancelled",
        message: byStudent
          ? `${names.studentName} cancelled the consultation on ${label}.`
          : `Your consultation with ${names.lecturerName} on ${label} was cancelled.`,
        type: "cancellation",
        appointmentId: row.id,
      });
      break;
    }
    case "rescheduled":
      await insertNotificationTx(tx, {
        userId: student,
        title: "Consultation rescheduled",
        message: `Your consultation with ${names.lecturerName} was moved to ${label}.`,
        type: "reschedule",
        appointmentId: row.id,
      });
      break;
    case "completed":
      await insertNotificationTx(tx, {
        userId: student,
        title: "Consultation completed",
        message: `Your consultation with ${names.lecturerName} on ${label} was marked as completed.`,
        type: "system",
        appointmentId: row.id,
      });
      break;
    case "no-show":
      await insertNotificationTx(tx, {
        userId: student,
        title: "Marked as no-show",
        message: `You were marked as no-show for your consultation with ${names.lecturerName} on ${label}.`,
        type: "system",
        appointmentId: row.id,
      });
      break;
    default:
      break;
  }
}

export async function cancelAppointmentAs(actor: Actor, id: string): Promise<Appointment> {
  const { row } = await loadForMutation(id);
  requireParty(actor, row, "either");
  return changeStatus(actor, id, "cancelled");
}

export async function approveAppointmentAs(actor: Actor, id: string): Promise<Appointment> {
  const { row } = await loadForMutation(id);
  requireParty(actor, row, "lecturer");
  return changeStatus(actor, id, "approved");
}

export async function rejectAppointmentAs(
  actor: Actor,
  id: string,
  reason?: string,
): Promise<Appointment> {
  const { row } = await loadForMutation(id);
  requireParty(actor, row, "lecturer");
  return changeStatus(actor, id, "rejected", { rejectionReason: reason?.trim() || undefined });
}

export async function completeAppointmentAs(actor: Actor, id: string): Promise<Appointment> {
  const { row } = await loadForMutation(id);
  requireParty(actor, row, "lecturer");
  return changeStatus(actor, id, "completed");
}

export async function noShowAppointmentAs(actor: Actor, id: string): Promise<Appointment> {
  const { row } = await loadForMutation(id);
  requireParty(actor, row, "lecturer");
  return changeStatus(actor, id, "no-show");
}

export async function rescheduleAppointmentAs(
  actor: Actor,
  id: string,
  input: { date: string; startTime: string; endTime: string },
): Promise<Appointment> {
  const { row } = await loadForMutation(id);
  requireParty(actor, row, "lecturer");
  assertValidTimeRange(input.startTime, input.endTime);
  const startMs = zonedWallToUtcMs(input.date, minutesOf(input.startTime));
  if (!(startMs > Date.now())) throw new Error("The new slot must be in the future.");
  await assertSlotBookable(row.lecturer_id, input.date, input.startTime, input.endTime, id);
  return changeStatus(actor, id, "rescheduled", {
    newStartDatetime: wallToISO(input.date, input.startTime),
    newEndDatetime: wallToISO(input.date, input.endTime),
  });
}

export async function updateAppointmentFieldsAs(
  actor: Actor,
  id: string,
  patch: { notes?: string | null; location?: string | null; meetingLink?: string | null; rejectionReason?: string | null },
): Promise<Appointment> {
  const { row, status } = await loadForMutation(id);
  if (actor.role === "student") {
    throw new ForbiddenError();
  }
  requireParty(actor, row, "lecturer");
  try {
    await withTransaction(async (tx) => {
      await setActor(tx, actor);
      await tx.query(
        `update public.appointments set notes = coalesce($2, notes),
           location = coalesce($3, location), meeting_link = coalesce($4, meeting_link),
           rejection_reason = coalesce($5, rejection_reason), updated_at = now()
         where id = $1`,
        [
          id,
          patch.notes ?? null,
          patch.location ?? null,
          patch.meetingLink ?? null,
          patch.rejectionReason ?? null,
        ],
      );
      void status;
    });
    const updated = await getAppointment(actor, id);
    if (!updated) throw new Error("Appointment not found.");
    return updated;
  } catch (err) {
    throw conflictOf(err);
  }
}

/** Legacy compat path: direct status set with ownership only (transitions still validated). */
export async function setAppointmentStatusAs(
  actor: Actor,
  id: string,
  to: AppointmentStatus,
  description?: string,
): Promise<Appointment | null> {
  const { row, status } = await loadForMutation(id).catch(() => ({ row: null, status: null }));
  if (!row || !status) return null;
  try {
    assertTransitionAllowed(status, to);
  } catch {
    return null;
  }
  if (actor.role !== "admin") {
    const own =
      (actor.role === "student" && actor.studentId === row.student_id) ||
      (actor.role === "lecturer" && actor.lecturerId === row.lecturer_id);
    if (!own) throw new ForbiddenError();
  }
  return changeStatus(actor, id, to, {
    rejectionReason: to === "rejected" && description ? description : undefined,
  });
}
