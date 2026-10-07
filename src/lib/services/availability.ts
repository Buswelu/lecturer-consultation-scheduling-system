/**
 * LCSS — availability service (PostgreSQL-backed fetch client).
 *
 * Same contracts as before; rules/exceptions/slots come from
 * `/api/availability/*` (authenticated, server-authorized) instead of
 * Supabase. Slot computation runs server-side; the DB overlap trigger
 * remains authoritative.
 */
import { apiGet, apiSend, queryString } from "./http";
import type {
  AvailabilityException,
  AvailabilityRule,
  BreakPeriod,
  DayOfWeek,
} from "@/lib/types";

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

/** Recurring weekly availability for a lecturer. */
export async function getLecturerAvailability(
  lecturerId: string,
): Promise<AvailabilityRule[]> {
  return getAvailabilityForLecturer(lecturerId);
}

export async function getAvailabilityForLecturer(lecturerId: string): Promise<AvailabilityRule[]> {
  const data = await apiGet<{ rules: AvailabilityRule[] }>(
    `/api/availability${queryString({ lecturerId })}`,
  );
  return data.rules;
}

export async function addAvailability(
  lecturerId: string,
  input: AvailabilityInput,
): Promise<AvailabilityRule> {
  const data = await apiSend<{ rule: AvailabilityRule }>("/api/availability", "POST", {
    lecturerId,
    ...input,
  });
  return data.rule;
}

/** Alias matching the service contract. */
export const createAvailability = addAvailability;

export async function updateAvailability(
  id: string,
  lecturerId: string,
  input: AvailabilityInput,
): Promise<AvailabilityRule> {
  const data = await apiSend<{ rule: AvailabilityRule }>(
    `/api/availability/${encodeURIComponent(id)}`,
    "PATCH",
    { lecturerId, ...input },
  );
  return data.rule;
}

export async function deleteAvailability(
  id: string,
  lecturerId?: string,
): Promise<void> {
  await apiSend(
    `/api/availability/${encodeURIComponent(id)}${queryString({ lecturerId })}`,
    "DELETE",
  );
}

/** One-off unavailable periods for a lecturer. */
export async function getAvailabilityExceptions(
  lecturerId: string,
): Promise<AvailabilityException[]> {
  const data = await apiGet<{ exceptions: AvailabilityException[] }>(
    `/api/availability${queryString({ lecturerId })}`,
  );
  return data.exceptions;
}

export async function addAvailabilityException(
  lecturerId: string,
  input: AvailabilityExceptionInput,
): Promise<AvailabilityException> {
  const data = await apiSend<{ exception: AvailabilityException }>(
    "/api/availability/exceptions",
    "POST",
    { lecturerId, ...input },
  );
  return data.exception;
}

/** Alias matching the service contract. */
export const createAvailabilityException = addAvailabilityException;

export async function deleteAvailabilityException(
  id: string,
  lecturerId?: string,
): Promise<void> {
  await apiSend(
    `/api/availability/exceptions/${encodeURIComponent(id)}${queryString({ lecturerId })}`,
    "DELETE",
  );
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

import type { Slot } from "@/lib/scheduling/slots";

/**
 * Bookable slots per date (server-computed). Returns every slot WITH its
 * status — callers filter `status === "available"`.
 */
export async function getAvailableSlots(
  query: AvailableSlotsQuery,
): Promise<Record<string, Slot[]>> {
  const data = await apiGet<{ slots: Record<string, Slot[]> }>(
    `/api/availability/slots${queryString({
      lecturerId: query.lecturerId,
      from: query.from,
      to: query.to,
      durationMinutes: query.durationMinutes ? String(query.durationMinutes) : undefined,
      excludeAppointmentId: query.excludeAppointmentId,
    })}`,
  );
  return data.slots;
}

export function getDayLabel(day: DayOfWeek): string {
  const labels: Record<DayOfWeek, string> = {
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
