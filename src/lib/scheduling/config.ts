/**
 * LCSS scheduling configuration (Phase 4).
 *
 * Single source of truth for slot-generation policy. Nothing in the
 * scheduling code hard-codes durations, notice periods, timezones, or
 * blocking statuses — everything flows from here.
 */

/**
 * Institution/local scheduling timezone (IANA name).
 *
 * Africa/Dar_es_Salaam (East Africa Time, UTC+3, no DST) — the institution
 * operates in Tanzania. All recurring availability (HH:MM wall-clock) and
 * slot generation are interpreted in this zone. If the institution moves,
 * change this ONE value; `datetime.ts` converts correctly (incl. DST).
 */
export const INSTITUTION_TIMEZONE = "Africa/Dar_es_Salaam";

/**
 * Default consultation duration in minutes.
 *
 * Used consistently everywhere unless an explicit per-call override is
 * supplied (e.g. a rule carrying its own duration in mock mode).
 */
export const CONSULTATION_DURATION_MINUTES = 30;

/**
 * Minimum booking notice in minutes.
 *
 * A slot whose start is sooner than `now + notice` is not bookable.
 * Currently 0 (no notice rule exists in the requirements) — this constant
 * is the documented extension point for adding one later.
 */
export const MIN_BOOKING_NOTICE_MINUTES = 0;

/**
 * Appointment statuses that block a time slot.
 *
 * Cancelled / rejected / completed / no-show appointments never block:
 * cancelled + rejected free the time, completed + no-show are in the past
 * (past slots are excluded independently).
 */
export const BLOCKING_APPOINTMENT_STATUSES = [
  "pending",
  "approved",
  "rescheduled",
] as const;

export type BlockingAppointmentStatus =
  (typeof BLOCKING_APPOINTMENT_STATUSES)[number];

/** True when an appointment status occupies its time slot. */
export function isBlockingStatus(status: string): boolean {
  return (BLOCKING_APPOINTMENT_STATUSES as readonly string[]).includes(status);
}
