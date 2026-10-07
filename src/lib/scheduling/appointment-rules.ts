/**
 * LCSS — appointment transition rules (universal: browser + server safe).
 *
 * Single source of truth for legal status changes (mirrors the DB
 * update-guard trigger). Imported by both the client services and the
 * server repositories so they can never disagree.
 */
import type { AppointmentStatus } from "@/lib/types";

/** Legal status transitions (mirrors the DB update-guard trigger). */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["approved", "rejected", "cancelled", "rescheduled"],
  approved: ["completed", "cancelled", "rescheduled", "no-show"],
  rescheduled: ["approved", "completed", "cancelled", "no-show"],
  rejected: [],
  cancelled: [],
  completed: [],
  "no-show": [],
};

/** Throw a friendly error when a transition is not allowed. */
export function assertTransitionAllowed(
  from: AppointmentStatus,
  to: AppointmentStatus,
): void {
  if (!(APPOINTMENT_TRANSITIONS[from] ?? []).includes(to)) {
    throw new Error(`Cannot change appointment from ${from} to ${to}.`);
  }
}
