import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { getCurrentLecturer } from "@/lib/supabase/auth";
import {
  dayNameToDbDay,
  mapAvailabilityException,
  mapAvailabilityRule,
} from "@/lib/supabase/mappers";
import {
  addDaysYMD,
  assertValidTimeRange,
  compareYMD,
  dayIndexToName,
  isUuid,
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
  BookingConflictError,
  type AvailabilityWindow,
  type Slot,
} from "@/lib/scheduling/slots";
import { getAppointmentsByLecturerInRange } from "./appointments";
import { availabilityRules } from "@/lib/mock-data";
import type {
  AvailabilityException,
  AvailabilityRule,
  BreakPeriod,
  DayOfWeek,
} from "@/lib/types";

/**
 * Phase 4 data mode: live Supabase when configured, mock fallback otherwise.
 * `IS_MOCK = true` remains as an explicit kill-switch (demos/tests).
 */
const IS_MOCK = false;

function isLiveEnabled(): boolean {
  return !IS_MOCK && isSupabaseConfigured();
}

/** Live UUID-column queries reject mock-style ids — route those to mock. */
function shouldUseLive(lecturerId: string): boolean {
  return isLiveEnabled() && isUuid(lecturerId);
}

export interface AvailabilityInput {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  duration: number;
  breaks?: BreakPeriod[];
}

export interface AvailabilityExceptionInput {
  startDatetime: string;
  endDatetime: string;
  reason?: string;
}

/**
 * Ownership gate for mutations. The lecturer id is derived from the caller's
 * session (never trusted from the browser alone); RLS `*_write_own`
 * policies remain the authoritative backstop.
 */
async function assertOwnLecturer(lecturerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return; // mock preview: no session to check
  const current = await getCurrentLecturer().catch(() => null);
  const ownId = current?.lecturer.id;
  if (!ownId) {
    throw new Error("You must be signed in as a lecturer to manage availability.");
  }
  if (ownId !== lecturerId) {
    throw new Error("You cannot modify another lecturer's availability.");
  }
}

/** Shared validation: format, start < end, no overlap with sibling rules. */
async function validateRuleInput(
  lecturerId: string,
  input: AvailabilityInput,
  excludeId?: string,
): Promise<void> {
  assertValidTimeRange(input.startTime, input.endTime);
  const existing = await getAvailabilityForLecturer(lecturerId);
  const siblings: AvailabilityWindow[] = existing
    .filter((r) => r.dayOfWeek === input.dayOfWeek && r.id !== excludeId)
    .map((r) => ({ startTime: r.startTime, endTime: r.endTime }));
  const clash = findOverlappingWindow(siblings, {
    startTime: input.startTime,
    endTime: input.endTime,
  });
  if (clash) {
    throw new Error(
      `This availability overlaps an existing period (${clash.startTime} – ${clash.endTime}).`,
    );
  }
}

/** Recurring weekly availability for a lecturer (spec §12). */
export async function getLecturerAvailability(
  lecturerId: string,
): Promise<AvailabilityRule[]> {
  return getAvailabilityForLecturer(lecturerId);
}

export async function getAvailabilityForLecturer(lecturerId: string): Promise<AvailabilityRule[]> {
  if (shouldUseLive(lecturerId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("availability")
        .select("*")
        .eq("lecturer_id", lecturerId)
        .eq("is_active", true)
        .order("day_of_week");
      if (error) throw error;
      return (data ?? []).map(mapAvailabilityRule);
    }
  }
  return availabilityRules.filter((a) => a.lecturerId === lecturerId);
}

export async function addAvailability(
  lecturerId: string,
  input: AvailabilityInput,
): Promise<AvailabilityRule> {
  await assertOwnLecturer(lecturerId);
  await validateRuleInput(lecturerId, input);

  if (shouldUseLive(lecturerId)) {
    const supabase = getSupabase();
    if (supabase) {
      // The Phase-4 schema stores day/start/end only; duration & breaks are
      // scheduling inputs echoed back, not persisted (no column exists).
      const { data, error } = await supabase
        .from("availability")
        .insert({
          lecturer_id: lecturerId,
          day_of_week: dayNameToDbDay(input.dayOfWeek),
          start_time: input.startTime,
          end_time: input.endTime,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      const rule = mapAvailabilityRule(data);
      rule.duration = input.duration;
      rule.breaks = input.breaks ?? [];
      return rule;
    }
  }

  const created: AvailabilityRule = {
    id: `avail-${Date.now()}`,
    lecturerId,
    ...input,
    unavailableDates: [],
  };
  availabilityRules.push(created);
  return created;
}

/** Alias matching the Phase-4 service contract. */
export const createAvailability = addAvailability;

export async function updateAvailability(
  id: string,
  lecturerId: string,
  input: AvailabilityInput,
): Promise<AvailabilityRule> {
  await assertOwnLecturer(lecturerId);
  await validateRuleInput(lecturerId, input, id);

  if (shouldUseLive(lecturerId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("availability")
        .update({
          day_of_week: dayNameToDbDay(input.dayOfWeek),
          start_time: input.startTime,
          end_time: input.endTime,
        })
        .eq("id", id)
        .eq("lecturer_id", lecturerId)
        .select()
        .single();
      if (error) throw error;
      const rule = mapAvailabilityRule(data);
      rule.duration = input.duration;
      rule.breaks = input.breaks ?? [];
      return rule;
    }
  }

  const index = availabilityRules.findIndex((r) => r.id === id);
  const updated: AvailabilityRule = {
    id,
    lecturerId,
    ...input,
    unavailableDates:
      index >= 0 ? (availabilityRules[index].unavailableDates ?? []) : [],
  };
  if (index >= 0) availabilityRules[index] = updated;
  return updated;
}

export async function deleteAvailability(
  id: string,
  lecturerId?: string,
): Promise<void> {
  if (lecturerId) await assertOwnLecturer(lecturerId);

  if (lecturerId && shouldUseLive(lecturerId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase
        .from("availability")
        .delete()
        .eq("id", id)
        .eq("lecturer_id", lecturerId);
      if (error) throw error;
      return;
    }
  }

  const index = availabilityRules.findIndex((r) => r.id === id);
  if (index >= 0) availabilityRules.splice(index, 1);
}

/** Module-level mock store for exceptions (no mock-data file exists). */
const mockExceptions: AvailabilityException[] = [];

/** One-off unavailable periods for a lecturer (spec §13). */
export async function getAvailabilityExceptions(
  lecturerId: string,
): Promise<AvailabilityException[]> {
  if (shouldUseLive(lecturerId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("availability_exceptions")
        .select("*")
        .eq("lecturer_id", lecturerId)
        .order("start_datetime");
      if (error) throw error;
      return (data ?? []).map(mapAvailabilityException);
    }
  }
  return mockExceptions
    .filter((e) => e.lecturerId === lecturerId)
    .sort((a, b) => (a.startDatetime < b.startDatetime ? -1 : 1));
}

export async function addAvailabilityException(
  lecturerId: string,
  input: AvailabilityExceptionInput,
): Promise<AvailabilityException> {
  await assertOwnLecturer(lecturerId);

  const startMs = new Date(input.startDatetime).getTime();
  const endMs = new Date(input.endDatetime).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    throw new Error("Exception end must be after exception start.");
  }

  if (shouldUseLive(lecturerId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("availability_exceptions")
        .insert({
          lecturer_id: lecturerId,
          start_datetime: input.startDatetime,
          end_datetime: input.endDatetime,
          reason: input.reason ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return mapAvailabilityException(data);
    }
  }

  const created: AvailabilityException = {
    id: `ex-${Date.now()}`,
    lecturerId,
    startDatetime: input.startDatetime,
    endDatetime: input.endDatetime,
    reason: input.reason,
  };
  mockExceptions.push(created);
  return created;
}

/** Alias matching the Phase-4 service contract. */
export const createAvailabilityException = addAvailabilityException;

export async function deleteAvailabilityException(
  id: string,
  lecturerId?: string,
): Promise<void> {
  if (lecturerId) await assertOwnLecturer(lecturerId);

  if (lecturerId && shouldUseLive(lecturerId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase
        .from("availability_exceptions")
        .delete()
        .eq("id", id)
        .eq("lecturer_id", lecturerId);
      if (error) throw error;
      return;
    }
  }

  const index = mockExceptions.findIndex((e) => e.id === id);
  if (index >= 0) mockExceptions.splice(index, 1);
}

export interface AvailableSlotsQuery {
  lecturerId: string;
  /** Inclusive wall-clock range, "YYYY-MM-DD". Max 62 days per call. */
  from: string;
  to: string;
  /** Defaults to CONSULTATION_DURATION_MINUTES. */
  durationMinutes?: number;
  minNoticeMinutes?: number;
  now?: Date;
  /** Skip blocking caused by this appointment (reschedule self-check). */
  excludeAppointmentId?: string;
}

/**
 * Bookable-slot engine (Phase 4 core): fetches only the relevant rules,
 * exceptions and appointments for [from, to], then generates slots per date.
 * Returns every slot WITH its status — callers filter `status === "available"`.
 */
export async function getAvailableSlots(
  query: AvailableSlotsQuery,
): Promise<Record<string, Slot[]>> {
  if (compareYMD(query.from, query.to) > 0) {
    throw new Error("Invalid date range: `from` must not be after `to`.");
  }

  const [rules, exceptions, appointments] = await Promise.all([
    getAvailabilityForLecturer(query.lecturerId),
    getAvailabilityExceptions(query.lecturerId),
    getAppointmentsByLecturerInRange(query.lecturerId, query.from, query.to),
  ]);

  const duration = query.durationMinutes ?? CONSULTATION_DURATION_MINUTES;
  const result: Record<string, Slot[]> = {};

  // Walk the range day by day (capped to avoid runaway queries).
  let date = query.from;
  let guard = 0;
  while (compareYMD(date, query.to) <= 0) {
    if (guard++ > 62) {
      throw new Error("Date range too large: request at most 62 days at once.");
    }
    const weekday = dayIndexToName(weekdayIndexYMD(date));
    const dayRules = rules.filter(
      (r) =>
        r.dayOfWeek === weekday &&
        !(r.unavailableDates ?? []).includes(date),
    );
    const windows: AvailabilityWindow[] = [];
    const breaks: { startTime: string; endTime: string }[] = [];
    for (const r of dayRules) {
      windows.push({ startTime: r.startTime, endTime: r.endTime });
      for (const b of r.breaks ?? []) {
        breaks.push({ startTime: b.startTime, endTime: b.endTime });
      }
    }
    const blocking = appointments
      .filter(
        (a) =>
          a.date.slice(0, 10) === date &&
          isBlockingStatus(a.status) &&
          a.id !== query.excludeAppointmentId,
      )
      .map((a) => ({
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
      }));

    result[date] =
      windows.length === 0
        ? []
        : generateSlotsForDate({
            date,
            windows,
            breaks,
            exceptions: exceptions.map((e) => ({
              startDatetime: e.startDatetime,
              endDatetime: e.endDatetime,
            })),
            appointments: blocking,
            durationMinutes: duration,
            minNoticeMinutes: query.minNoticeMinutes ?? MIN_BOOKING_NOTICE_MINUTES,
            now: query.now,
          });
    date = addDaysYMD(date, 1);
  }

  return result;
}

/**
 * Assert a single wall-clock slot is currently bookable for a lecturer.
 * Used immediately before booking/rescheduling (the DB exclusion constraint
 * remains the atomic backstop for races).
 */
export async function assertSlotAvailable(
  lecturerId: string,
  date: string,
  startTime: string,
  endTime: string,
  opts?: { excludeAppointmentId?: string; durationMinutes?: number },
): Promise<void> {
  assertValidTimeRange(startTime, endTime);
  const slots = await getAvailableSlots({
    lecturerId,
    from: date,
    to: date,
    durationMinutes: opts?.durationMinutes,
    excludeAppointmentId: opts?.excludeAppointmentId,
  });
  const slot = (slots[date] ?? []).find(
    (s) => s.startTime === startTime && s.endTime === endTime,
  );
  if (!slot || slot.status !== "available") {
    throw new BookingConflictError();
  }
}

export function getDayLabel(day: DayOfWeek): string {  const labels: Record<DayOfWeek, string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
  };
  return labels[day];
}

export const dayOrder: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

// Re-export the scheduling engine for consumers that need it directly.
export { generateSlotsForDate, bookableSlots } from "@/lib/scheduling/slots";
export type { Slot, SlotStatus } from "@/lib/scheduling/slots";
