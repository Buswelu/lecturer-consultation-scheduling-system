/**
 * LCSS — availability repository (server-only).
 *
 * Reads are authenticated-only. Mutations are owning-lecturer-or-admin.
 * Slot generation reuses the pure scheduling engine; the DB overlap trigger
 * remains the authoritative backstop (friendly pre-checks included).
 */
import "server-only";
import { getPool } from "@/lib/db/pool";
import { queryOne } from "@/lib/db/query";
import {
  dayNameToDbDay,
  dbDayToName,
  mapAvailabilityException,
  mapAvailabilityRule,
} from "@/lib/db/mappers";
import {
  addDaysYMD,
  assertValidTimeRange,
  compareYMD,
  dayIndexToName,
  splitDatetimeInTZ,
  weekdayIndexYMD,
} from "@/lib/scheduling/datetime";
import {
  CONSULTATION_DURATION_MINUTES,
  MIN_BOOKING_NOTICE_MINUTES,
  isBlockingStatus,
} from "@/lib/scheduling/config";
import {
  findOverlappingWindow,
  generateSlotsForDate,
  type AvailabilityWindow,
  type Slot,
} from "@/lib/scheduling/slots";
import type {
  AvailabilityException,
  AvailabilityRule,
  DayOfWeek,
} from "@/lib/types";
import type {
  Actor,
  AvailabilityExceptionsRow,
  AvailabilityRow,
} from "./types";
import { ForbiddenError } from "./types";

export async function rulesForLecturer(lecturerId: string): Promise<AvailabilityRule[]> {
  const { rows } = await getPool().query<AvailabilityRow>(
    "select * from public.availability where lecturer_id = $1 and is_active order by day_of_week",
    [lecturerId],
  );
  return rows.map(mapAvailabilityRule);
}

export async function exceptionsForLecturer(lecturerId: string): Promise<AvailabilityException[]> {
  const { rows } = await getPool().query<AvailabilityExceptionsRow>(
    "select * from public.availability_exceptions where lecturer_id = $1 order by start_datetime",
    [lecturerId],
  );
  return rows.map(mapAvailabilityException);
}

function requireOwner(actor: Actor, lecturerId: string): void {
  if (actor.role === "admin") return;
  if (actor.role === "lecturer" && actor.lecturerId === lecturerId) return;
  throw new ForbiddenError();
}

async function validateRule(
  lecturerId: string,
  input: { dayOfWeek: DayOfWeek; startTime: string; endTime: string },
  excludeId?: string,
): Promise<void> {
  assertValidTimeRange(input.startTime, input.endTime);
  const existing = await rulesForLecturer(lecturerId);
  const clash = findOverlappingWindow(
    existing
      .filter((r) => r.dayOfWeek === input.dayOfWeek && r.id !== excludeId)
      .map((r) => ({ startTime: r.startTime, endTime: r.endTime })),
    { startTime: input.startTime, endTime: input.endTime },
  );
  if (clash) {
    throw new Error(
      `This availability overlaps an existing period (${clash.startTime} – ${clash.endTime}).`,
    );
  }
}

function withEcho(
  rule: AvailabilityRule,
  input: { duration?: number; breaks?: AvailabilityRule["breaks"] },
): AvailabilityRule {
  // Duration/breaks are scheduling inputs echoed back, not persisted
  // (the schema stores day/start/end only).
  return {
    ...rule,
    duration: input.duration ?? rule.duration,
    breaks: input.breaks ?? rule.breaks ?? [],
  };
}

export async function addRule(
  actor: Actor,
  lecturerId: string,
  input: { dayOfWeek: DayOfWeek; startTime: string; endTime: string; duration?: number; breaks?: AvailabilityRule["breaks"] },
): Promise<AvailabilityRule> {
  requireOwner(actor, lecturerId);
  await validateRule(lecturerId, input);
  const lecturer = await queryOne<{ id: string }>(
    "select id from public.lecturers where id = $1",
    [lecturerId],
  );
  if (!lecturer) throw new Error("Lecturer not found.");
  try {
    const row = await queryOne<AvailabilityRow>(
      `insert into public.availability (lecturer_id, day_of_week, start_time, end_time, is_active)
       values ($1, $2, $3, $4, true) returning *`,
      [lecturerId, dayNameToDbDay(input.dayOfWeek), input.startTime, input.endTime],
    );
    if (!row) throw new Error("Could not save the availability.");
    return withEcho(mapAvailabilityRule(row), input);
  } catch (err) {
    throw friendlyOverlap(err);
  }
}

export async function updateRule(
  actor: Actor,
  id: string,
  lecturerId: string,
  input: { dayOfWeek: DayOfWeek; startTime: string; endTime: string; duration?: number; breaks?: AvailabilityRule["breaks"] },
): Promise<AvailabilityRule> {
  requireOwner(actor, lecturerId);
  await validateRule(lecturerId, input, id);
  try {
    const row = await queryOne<AvailabilityRow>(
      `update public.availability set day_of_week = $3, start_time = $4, end_time = $5
        where id = $1 and lecturer_id = $2 returning *`,
      [id, lecturerId, dayNameToDbDay(input.dayOfWeek), input.startTime, input.endTime],
    );
    if (!row) throw new Error("Availability not found.");
    return withEcho(mapAvailabilityRule(row), input);
  } catch (err) {
    throw friendlyOverlap(err);
  }
}

export async function deleteRule(actor: Actor, id: string, lecturerId: string): Promise<void> {
  requireOwner(actor, lecturerId);
  await getPool().query("delete from public.availability where id = $1 and lecturer_id = $2", [
    id,
    lecturerId,
  ]);
}

export async function addException(
  actor: Actor,
  lecturerId: string,
  input: { startDatetime: string; endDatetime: string; reason?: string },
): Promise<AvailabilityException> {
  requireOwner(actor, lecturerId);
  const startMs = Date.parse(input.startDatetime);
  const endMs = Date.parse(input.endDatetime);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    throw new Error("Exception end must be after exception start.");
  }
  const row = await queryOne<AvailabilityExceptionsRow>(
    `insert into public.availability_exceptions (lecturer_id, start_datetime, end_datetime, reason)
     values ($1, $2, $3, nullif($4, '')) returning *`,
    [lecturerId, input.startDatetime, input.endDatetime, input.reason?.trim() || ""],
  );
  if (!row) throw new Error("Could not save the exception.");
  return mapAvailabilityException(row);
}

export async function deleteException(
  actor: Actor,
  id: string,
  lecturerId: string,
): Promise<void> {
  requireOwner(actor, lecturerId);
  await getPool().query(
    "delete from public.availability_exceptions where id = $1 and lecturer_id = $2",
    [id, lecturerId],
  );
}

export interface SlotsQuery {
  lecturerId: string;
  from: string;
  to: string;
  durationMinutes?: number;
  minNoticeMinutes?: number;
  excludeAppointmentId?: string;
}

/** Blocking appointments for slot computation (server-side range fetch). */
export async function blockingAppointmentsInRange(
  lecturerId: string,
  from: string,
  to: string,
): Promise<{ id: string; date: string; startTime: string; endTime: string; status: string }[]> {
  const { rows } = await getPool().query<{
    id: string;
    start_datetime: string;
    end_datetime: string;
    status: string;
  }>(
    `select id, start_datetime, end_datetime, status from public.appointments
      where lecturer_id = $1
        and start_datetime >= ($2::timestamptz)
        and start_datetime <= ($3::timestamptz + interval '1 day')
      order by start_datetime`,
    [lecturerId, `${from}T00:00:00+03:00`, `${to}T00:00:00+03:00`],
  );
  return rows.map((r) => {
    const start = splitDatetimeInTZ(r.start_datetime);
    const end = splitDatetimeInTZ(r.end_datetime);
    return { id: r.id, date: start.date, startTime: start.time, endTime: end.time, status: r.status };
  });
}

export async function computeSlots(query: SlotsQuery): Promise<Record<string, Slot[]>> {
  if (compareYMD(query.from, query.to) > 0) {
    throw new Error("Invalid date range: `from` must not be after `to`.");
  }
  const [rules, exceptions, appointments] = await Promise.all([
    rulesForLecturer(query.lecturerId),
    exceptionsForLecturer(query.lecturerId),
    blockingAppointmentsInRange(query.lecturerId, query.from, query.to),
  ]);
  const duration = query.durationMinutes ?? CONSULTATION_DURATION_MINUTES;
  const result: Record<string, Slot[]> = {};
  let date = query.from;
  let guard = 0;
  while (compareYMD(date, query.to) <= 0) {
    if (guard++ > 62) {
      throw new Error("Date range too large: request at most 62 days at once.");
    }
    const weekday = dayIndexToName(weekdayIndexYMD(date));
    const windows: AvailabilityWindow[] = rules
      .filter((r) => r.dayOfWeek === weekday)
      .map((r) => ({ startTime: r.startTime, endTime: r.endTime }));
    const blocking = appointments
      .filter(
        (a) =>
          a.date === date &&
          isBlockingStatus(a.status) &&
          a.id !== query.excludeAppointmentId,
      )
      .map((a) => ({ startTime: a.startTime, endTime: a.endTime, status: a.status }));
    result[date] =
      windows.length === 0
        ? []
        : generateSlotsForDate({
            date,
            windows,
            breaks: [],
            exceptions: exceptions.map((e) => ({
              startDatetime: e.startDatetime,
              endDatetime: e.endDatetime,
            })),
            appointments: blocking,
            durationMinutes: duration,
            minNoticeMinutes: query.minNoticeMinutes ?? MIN_BOOKING_NOTICE_MINUTES,
          });
    date = addDaysYMD(date, 1);
  }
  return result;
}

export { dbDayToName };

function friendlyOverlap(err: unknown): Error {
  const message = err instanceof Error ? err.message : "";
  if (/overlaps an existing/i.test(message)) return err instanceof Error ? err : new Error(message);
  if (message) return err instanceof Error ? err : new Error(message);
  return new Error("Could not save the availability.");
}
