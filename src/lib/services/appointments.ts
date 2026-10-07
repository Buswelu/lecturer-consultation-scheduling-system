/**
 * LCSS — appointments service (PostgreSQL-backed fetch client).
 *
 * Same contracts as before; all reads/mutations go through
 * `/api/appointments` (authenticated, server-authorized, transactional
 * with notifications + audit history). Pure rules stay local.
 */
import { apiGet, apiSend, queryString } from "./http";
import {
  APPOINTMENT_TRANSITIONS,
  assertTransitionAllowed,
} from "@/lib/scheduling/appointment-rules";
import { BookingConflictError } from "@/lib/scheduling/slots";
import type {
  Appointment,
  AppointmentHistoryEntry,
  AppointmentStatus,
  ConsultationType,
} from "@/lib/types";

export { APPOINTMENT_TRANSITIONS, assertTransitionAllowed };
export { BookingConflictError };

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

/** Map raw errors onto friendly, non-leaking messages. */
export function toFriendlyBookingError(error: unknown): Error {
  if (error instanceof BookingConflictError) return error;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  const rawMessage = error instanceof Error ? error.message : "";
  if (code === "23P01" || /no_double_booking|overlaps an existing/i.test(rawMessage)) {
    return new BookingConflictError();
  }
  if (code === "42501" || /row-level security|not authorized|permission denied/i.test(rawMessage)) {
    return new Error("You are not authorized to perform this action.");
  }
  if (code === "23503" || /foreign key|no longer available/i.test(rawMessage)) {
    return new Error("The selected lecturer or course is no longer available.");
  }
  if (/Students may only cancel|Lecturers may only update status|Lecturers cannot reassign/i.test(rawMessage)) {
    return new Error(rawMessage);
  }
  if (rawMessage) return new Error(rawMessage);
  return new Error("We couldn't process your request right now.");
}

export async function getAppointments(filters?: AppointmentFilters): Promise<Appointment[]> {
  const data = await apiGet<{ appointments: Appointment[] }>(
    `/api/appointments${queryString({
      status: filters?.status,
      lecturerId: filters?.lecturerId,
      courseId: filters?.courseId,
      search: filters?.search,
      departmentId: filters?.departmentId,
    })}`,
  );
  return data.appointments;
}

/** Server-paginated appointments with total count. */
export async function getAppointmentsPage(
  filters: AppointmentFilters | undefined,
  page: number,
  pageSize: number,
): Promise<AppointmentPage> {
  const data = await apiGet<{
    appointments: Appointment[];
    total: number;
    page: number;
    pageSize: number;
  }>(
    `/api/appointments${queryString({
      status: filters?.status,
      lecturerId: filters?.lecturerId,
      courseId: filters?.courseId,
      search: filters?.search,
      departmentId: filters?.departmentId,
      page: String(page),
      pageSize: String(pageSize),
    })}`,
  );
  return {
    items: data.appointments,
    total: data.total,
    page: data.page,
    pageSize: data.pageSize,
  };
}

export async function getStudentAppointments(
  studentId: string,
): Promise<Appointment[]> {
  return getAppointmentsByStudent(studentId);
}

export async function getAppointmentsByStudent(studentId: string): Promise<Appointment[]> {
  void studentId;
  // The server scopes to the authenticated student; the parameter is kept
  // for contract compatibility.
  const data = await apiGet<{ appointments: Appointment[] }>("/api/appointments");
  return data.appointments;
}

export async function getLecturerAppointments(
  lecturerId: string,
): Promise<Appointment[]> {
  return getAppointmentsByLecturer(lecturerId);
}

export async function getAppointmentsByLecturer(lecturerId: string): Promise<Appointment[]> {
  const data = await apiGet<{ appointments: Appointment[] }>(
    `/api/appointments${queryString({ lecturerId })}`,
  );
  return data.appointments;
}

/**
 * Appointments for a lecturer intersecting [from, to].
 * (Range narrowing happens client-side; the API returns the scoped list.)
 */
export async function getAppointmentsByLecturerInRange(
  lecturerId: string,
  from: string,
  to: string,
): Promise<Appointment[]> {
  const all = await getAppointmentsByLecturer(lecturerId);
  return all.filter((a) => {
    const day = a.date.slice(0, 10);
    return day >= from && day <= to;
  });
}

export async function getAppointmentById(id: string): Promise<Appointment | null> {
  const data = await apiGet<{ appointment: Appointment }>(
    `/api/appointments/${encodeURIComponent(id)}`,
  ).catch(() => null);
  return data?.appointment ?? null;
}

/** Alias matching the service contract. */
export const getAppointment = getAppointmentById;

/** Audit trail for an appointment (auto-logged server-side). */
export async function getAppointmentHistory(
  appointmentId: string,
): Promise<AppointmentHistoryEntry[]> {
  const appointment = await getAppointmentById(appointmentId);
  return appointment?.history ?? [];
}

/**
 * Create a consultation request (always starts as `pending`).
 * The student id comes from the authenticated session server-side.
 */
export async function createAppointment(input: NewAppointmentInput): Promise<Appointment> {
  const data = await apiSend<{ appointment: Appointment }>("/api/appointments", "POST", input);
  return data.appointment;
}

async function act(
  id: string,
  body: Record<string, unknown>,
): Promise<Appointment> {
  const data = await apiSend<{ appointment: Appointment }>(
    `/api/appointments/${encodeURIComponent(id)}`,
    "PATCH",
    body,
  );
  return data.appointment;
}

/** Student or lecturer cancels their own appointment. */
export async function cancelAppointment(
  id: string,
  cancelledBy?: "student" | "lecturer",
): Promise<Appointment> {
  void cancelledBy;
  return act(id, { action: "cancel" });
}

/** Lecturer approves a pending request. */
export async function approveAppointment(id: string): Promise<Appointment> {
  return act(id, { action: "approve" });
}

/** Lecturer rejects a pending request (reason recorded + notified). */
export async function rejectAppointment(id: string, reason?: string): Promise<Appointment> {
  return act(id, { action: "reject", reason });
}

/** Lecturer marks an approved/rescheduled consultation completed. */
export async function markCompleted(id: string): Promise<Appointment> {
  return act(id, { action: "complete" });
}

/** Lecturer marks a student as no-show. */
export async function markNoShow(id: string): Promise<Appointment> {
  return act(id, { action: "no_show" });
}

export interface RescheduleInput {
  date: string;
  startTime: string;
  endTime: string;
}

/** Lecturer moves an appointment to another available slot. */
export async function rescheduleAppointment(
  id: string,
  input: RescheduleInput,
): Promise<Appointment> {
  return act(id, { action: "reschedule", ...input });
}

/**
 * Lecturer/admin field update (notes, location, meeting link, rejection
 * reason). Identities, times and status are immutable through this path.
 */
export async function updateAppointment(
  id: string,
  patch: {
    notes?: string | null;
    location?: string | null;
    meetingLink?: string | null;
    rejectionReason?: string | null;
  },
): Promise<Appointment> {
  return act(id, { action: "update", ...patch });
}

/**
 * Legacy status setter (kept for compatibility). Prefer the dedicated
 * transition functions, which validate roles, ownership and notifications.
 */
export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  description?: string,
): Promise<Appointment | null> {
  try {
    return await act(id, { action: "status", status, description });
  } catch {
    return null;
  }
}
