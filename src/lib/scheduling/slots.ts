/**
 * LCSS slot-generation algorithm (Phase 4).
 *
 * Pure functions — no I/O, no Supabase, fully unit-testable. The service
 * layer (`services/availability.ts`) fetches rules/exceptions/appointments
 * and feeds them here; both lecturer and student views share this logic.
 *
 * Semantics (documented decisions):
 * - Recurring windows define the base availability for a weekday.
 * - `availability_exceptions` rows SUBTRACT time: any slot overlapping an
 *   exception interval is `unavailable`. A full-day exception (covering the
 *   whole local day, 00:00 → 23:59+) yields ZERO slots for that date.
 * - Breaks carve out sub-ranges the same way as exceptions.
 * - Appointments with a blocking status (`pending` → `pending`,
 *   `approved`/`rescheduled` → `booked`) occupy their span. Non-blocking
 *   statuses (cancelled/rejected/completed/no-show) must be filtered out by
 *   the caller and never block.
 * - Slots are half-open [start, end): a slot fits iff end <= window end
 *   (no `10:00 → 10:30` spilling out of a `09:00 → 10:00` window).
 * - Adjacent ranges never count as overlapping.
 * - Past/notice evaluation is epoch-based (`zonedWallToUtcMs`), so wall
 *   times are never compared against UTC timestamps incorrectly.
 */
import {
  BLOCKING_APPOINTMENT_STATUSES,
  CONSULTATION_DURATION_MINUTES,
  INSTITUTION_TIMEZONE,
  MIN_BOOKING_NOTICE_MINUTES,
} from "./config";
import {
  assertValidTimeRange,
  minutesToTime,
  timeToMinutes,
  zonedWallToUtcMs,
} from "./datetime";

export type SlotStatus =
  | "available"
  | "booked"
  | "pending"
  | "past"
  | "unavailable";

/**
 * Thrown when a booking/reschedule collides with another active
 * appointment — including the race where the DB exclusion constraint
 * rejects a second concurrent insert (mapped from SQLSTATE 23P01).
 * Carries the user-facing message; never raw SQL.
 */
export class BookingConflictError extends Error {
  constructor(
    message = "Sorry, this time slot was just booked by another student. Please choose another slot.",
  ) {
    super(message);
    this.name = "BookingConflictError";
  }
}

export interface Slot {
  date: string;
  startTime: string;
  endTime: string;
  status: SlotStatus;
}

/** One recurring availability window, wall-clock HH:MM. */
export interface AvailabilityWindow {
  startTime: string;
  endTime: string;
}

/** Wall-clock break within a window, HH:MM. */
export interface BreakWindow {
  startTime: string;
  endTime: string;
}

/**
 * An unavailable interval as ISO instants (exceptions) — converted to
 * wall-clock ranges on the target date internally.
 */
export interface ExceptionInterval {
  startDatetime: string;
  endDatetime: string;
}

/** An appointment occupying time on the target date (pre-filtered to blocking statuses). */
export interface BlockingAppointment {
  startTime: string;
  endTime: string;
  status: string;
}

export interface GenerateSlotsInput {
  /** Wall-clock date "YYYY-MM-DD" in the institution timezone. */
  date: string;
  /** Recurring windows applying to this date's weekday. */
  windows: AvailabilityWindow[];
  /** Breaks to carve out (wall-clock HH:MM). */
  breaks?: BreakWindow[];
  /** Exception intervals overlapping this date (ISO instants). */
  exceptions?: ExceptionInterval[];
  /** Blocking appointments on this date (wall-clock HH:MM). */
  appointments?: BlockingAppointment[];
  durationMinutes?: number;
  minNoticeMinutes?: number;
  /** Reference instant (injectable for tests). Defaults to now. */
  now?: Date;
  timeZone?: string;
}

/** Strict half-open overlap: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅. */
export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Find the first existing window overlapping the candidate, or null.
 * Shared by the service pre-check, form validation, and unit tests.
 * Adjacent ranges (candidate end == existing start) are allowed.
 */
export function findOverlappingWindow(
  existing: AvailabilityWindow[],
  candidate: AvailabilityWindow,
  excludeIndex = -1,
): AvailabilityWindow | null {
  const cStart = timeToMinutes(candidate.startTime);
  const cEnd = timeToMinutes(candidate.endTime);
  for (let i = 0; i < existing.length; i += 1) {
    if (i === excludeIndex) continue;
    const w = existing[i];
    if (rangesOverlap(cStart, cEnd, timeToMinutes(w.startTime), timeToMinutes(w.endTime))) {
      return w;
    }
  }
  return null;
}

/** Validate a candidate window (format + start < end). Throws on invalid. */
export function validateWindow(window: AvailabilityWindow): void {
  assertValidTimeRange(window.startTime, window.endTime);
}

/** Map a blocking appointment status onto a slot status. */
function statusForAppointment(status: string): SlotStatus {
  return status === "pending" ? "pending" : "booked";
}

export function generateSlotsForDate(input: GenerateSlotsInput): Slot[] {
  const {
    date,
    windows,
    breaks = [],
    exceptions = [],
    appointments = [],
    durationMinutes = CONSULTATION_DURATION_MINUTES,
    minNoticeMinutes = MIN_BOOKING_NOTICE_MINUTES,
    now = new Date(),
    timeZone = INSTITUTION_TIMEZONE,
  } = input;

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Slot duration must be a positive number of minutes.");
  }

  const nowMs = now.getTime();
  const noticeMs = Math.max(0, minNoticeMinutes) * 60_000;

  // Validate windows up front (fail fast on bad ranges like 09:00 → 08:00).
  for (const w of windows) validateWindow(w);

  // Convert exception ISO intervals into wall-clock blocked ranges for `date`.
  const blocked: { start: number; end: number }[] = [];
  for (const ex of exceptions) {
    const startMs = new Date(ex.startDatetime).getTime();
    const endMs = new Date(ex.endDatetime).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
      continue;
    }
    const dayStartMs = zonedWallToUtcMs(date, 0, timeZone);
    const dayEndMs = zonedWallToUtcMs(date, 24 * 60, timeZone);
    if (endMs <= dayStartMs || startMs >= dayEndMs) continue;
    const startMin = startMs <= dayStartMs ? 0 : Math.floor((startMs - dayStartMs) / 60_000);
    const endMin =
      endMs >= dayEndMs ? 24 * 60 : Math.ceil((endMs - dayStartMs) / 60_000);
    blocked.push({ start: Math.max(0, startMin), end: Math.min(24 * 60, endMin) });
  }
  for (const b of breaks) {
    blocked.push({ start: timeToMinutes(b.startTime), end: timeToMinutes(b.endTime) });
  }

  // Full-day closure: an exception spanning the whole wall-clock day
  // (00:00 → 23:59 or beyond) yields zero slots for the date.
  const fullyBlocked = blocked.some((b) => b.start <= 0 && b.end >= 24 * 60 - 1);
  if (fullyBlocked) return [];

  const busy: { start: number; end: number; status: SlotStatus }[] = appointments
    .filter((a) =>
      (BLOCKING_APPOINTMENT_STATUSES as readonly string[]).includes(a.status),
    )
    .map((a) => ({
      start: timeToMinutes(a.startTime),
      end: timeToMinutes(a.endTime),
      status: statusForAppointment(a.status),
    }));

  const slots: Slot[] = [];
  for (const w of windows) {
    const startMin = timeToMinutes(w.startTime);
    const endMin = timeToMinutes(w.endTime);
    for (let t = startMin; t + durationMinutes <= endMin; t += durationMinutes) {
      const slotEnd = t + durationMinutes;
      const absStart = zonedWallToUtcMs(date, t, timeZone);
      const absEnd = zonedWallToUtcMs(date, slotEnd, timeZone);

      let status: SlotStatus = "available";
      if (absEnd <= nowMs) {
        status = "past";
      } else if (absStart < nowMs + noticeMs) {
        status = "unavailable";
      } else if (blocked.some((b) => rangesOverlap(t, slotEnd, b.start, b.end))) {
        status = "unavailable";
      } else {
        const hit = busy.find((b) => rangesOverlap(t, slotEnd, b.start, b.end));
        if (hit) status = hit.status;
      }

      slots.push({
        date,
        startTime: minutesToTime(t),
        endTime: minutesToTime(slotEnd),
        status,
      });
    }
  }

  slots.sort((a, b) =>
    a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0,
  );
  return slots;
}

/** Bookable subset of generated slots. */
export function bookableSlots(slots: Slot[]): Slot[] {
  return slots.filter((s) => s.status === "available");
}
