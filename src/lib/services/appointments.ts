import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  getCurrentLecturer,
  getCurrentProfile,
  getCurrentStudent,
} from "@/lib/supabase/auth";
import {
  combineDatetime,
  mapAppointment,
  mapAppointmentHistoryEntry,
  toDbAppointmentStatus,
  toDbConsultationType,
} from "@/lib/supabase/mappers";
import { splitDatetimeInTZ } from "@/lib/scheduling/datetime";
import { BookingConflictError } from "@/lib/scheduling/slots";
import { assertValidTimeRange, isUuid, zonedWallToUtcMs } from "@/lib/scheduling/datetime";
import { assertSlotAvailable } from "./availability";
import { createNotification } from "./notifications";
import { getCoursesByLecturer } from "./courses";
import { getLecturerById } from "./lecturers";
import { appointments } from "@/lib/mock-data";
import type {
  Appointment,
  AppointmentHistoryEntry,
  AppointmentStatus,
  ConsultationType,
} from "@/lib/types";

/**
 * Phase 5 data mode: live Supabase when configured, mock fallback otherwise.
 * `IS_MOCK = true` remains as an explicit kill-switch (demos/tests).
 */
const IS_MOCK = false;

function isLive(): boolean {
  return !IS_MOCK && isSupabaseConfigured();
}

/** Live UUID-column queries reject mock-style ids — route those to mock. */
function isLiveId(id: string): boolean {
  return isLive() && isUuid(id);
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

export interface AppointmentFilters {
  status?: AppointmentStatus;
  lecturerId?: string;
  courseId?: string;
  search?: string;
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

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

type ActorRole = "student" | "lecturer" | "admin";

interface Actor {
  role: ActorRole | null;
  studentId: string | null;
  lecturerId: string | null;
  profileId: string | null;
}

/**
 * Resolve the caller from the session (never from client-supplied ids).
 * In mock preview mode there is no session — callers are permissive.
 */
async function resolveActor(): Promise<Actor> {
  const none: Actor = { role: null, studentId: null, lecturerId: null, profileId: null };
  if (!isSupabaseConfigured()) return none;
  const [student, lecturer, profile] = await Promise.all([
    getCurrentStudent().catch(() => null),
    getCurrentLecturer().catch(() => null),
    getCurrentProfile().catch(() => null),
  ]);
  if (student) {
    return {
      role: "student",
      studentId: student.student.id,
      lecturerId: null,
      profileId: student.profile.id,
    };
  }
  if (lecturer) {
    return {
      role: "lecturer",
      studentId: null,
      lecturerId: lecturer.lecturer.id,
      profileId: lecturer.profile.id,
    };
  }
  if (profile && profile.role === "admin") {
    return { role: "admin", studentId: null, lecturerId: null, profileId: profile.id };
  }
  return none;
}

/** Map raw DB errors onto friendly, non-leaking messages. */
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

function historyActionLabel(status: AppointmentStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Completed";
    case "rescheduled":
      return "Rescheduled";
    case "no-show":
      return "No-show";
    default:
      return "Updated";
  }
}

// ---------------------------------------------------------------------------
// Reads (live with display-name attach, mock fallback)
// ---------------------------------------------------------------------------

/**
 * Attach lecturer/student/course display names (live only, best-effort —
 * never throws: RLS may legitimately hide some rows from the caller).
 */
async function attachDisplayNames(list: Appointment[]): Promise<Appointment[]> {
  const supabase = getSupabase();
  if (!supabase || list.length === 0) return list;
  try {
    const lecturerIds = [...new Set(list.map((a) => a.lecturerId))];
    const studentIds = [...new Set(list.map((a) => a.studentId))];
    const courseIds = [...new Set(list.map((a) => a.courseId).filter(Boolean))];
    const [lecRes, stuRes, courseRes] = await Promise.all([
      lecturerIds.length > 0
        ? supabase.from("lecturers").select("id, profiles(full_name)").in("id", lecturerIds)
        : Promise.resolve({ data: [], error: null } as const),
      studentIds.length > 0
        ? supabase.from("students").select("id, profiles(full_name)").in("id", studentIds)
        : Promise.resolve({ data: [], error: null } as const),
      courseIds.length > 0
        ? supabase.from("courses").select("id, name").in("id", courseIds)
        : Promise.resolve({ data: [], error: null } as const),
    ]);
    if (lecRes.error || stuRes.error || courseRes.error) return list;
    const lecNames = new Map(
      (lecRes.data ?? [])
        .filter((r) => r.profiles)
        .map((r) => [r.id, r.profiles.full_name] as const),
    );
    const stuNames = new Map(
      (stuRes.data ?? [])
        .filter((r) => r.profiles)
        .map((r) => [r.id, r.profiles.full_name] as const),
    );
    const courseNames = new Map((courseRes.data ?? []).map((c) => [c.id, c.name] as const));
    return list.map((a) => ({
      ...a,
      lecturerName: lecNames.get(a.lecturerId),
      studentName: stuNames.get(a.studentId),
      courseName: courseNames.get(a.courseId),
    }));
  } catch {
    return list;
  }
}

export async function getAppointments(filters?: AppointmentFilters): Promise<Appointment[]> {
  if (isLive()) {
    const supabase = getSupabase();
    if (supabase) {
      let query = supabase.from("appointments").select("*");
      if (filters?.status) query = query.eq("status", toDbAppointmentStatus(filters.status));
      if (filters?.lecturerId && isUuid(filters.lecturerId)) {
        query = query.eq("lecturer_id", filters.lecturerId);
      }
      if (filters?.courseId && isUuid(filters.courseId)) {
        query = query.eq("course_id", filters.courseId);
      }
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return attachDisplayNames((data ?? []).map(mapAppointment));
    }
  }

  let result = [...appointments];
  if (filters?.status) result = result.filter((a) => a.status === filters.status);
  if (filters?.lecturerId) result = result.filter((a) => a.lecturerId === filters.lecturerId);
  if (filters?.courseId) result = result.filter((a) => a.courseId === filters.courseId);
  return result;
}

export async function getStudentAppointments(
  studentId: string,
): Promise<Appointment[]> {
  return getAppointmentsByStudent(studentId);
}

export async function getAppointmentsByStudent(studentId: string): Promise<Appointment[]> {
  if (isLiveId(studentId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return attachDisplayNames((data ?? []).map(mapAppointment));
    }
  }
  return appointments.filter((a) => a.studentId === studentId);
}

export async function getLecturerAppointments(
  lecturerId: string,
): Promise<Appointment[]> {
  return getAppointmentsByLecturer(lecturerId);
}

export async function getAppointmentsByLecturer(lecturerId: string): Promise<Appointment[]> {
  if (isLiveId(lecturerId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("lecturer_id", lecturerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return attachDisplayNames((data ?? []).map(mapAppointment));
    }
  }
  return appointments.filter((a) => a.lecturerId === lecturerId);
}

/**
 * Appointments for a lecturer intersecting [from, to] (inclusive YMD).
 * Used by slot generation so only relevant rows are fetched.
 * Domain `date` may be YMD (live) or ISO (mock) — normalized via slice.
 */
export async function getAppointmentsByLecturerInRange(
  lecturerId: string,
  from: string,
  to: string,
): Promise<Appointment[]> {
  if (isLiveId(lecturerId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("lecturer_id", lecturerId)
        .gte("start_datetime", `${from}T00:00:00`)
        .lte("start_datetime", `${to}T23:59:59.999`)
        .order("start_datetime", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapAppointment);
    }
  }
  return appointments.filter((a) => {
    if (a.lecturerId !== lecturerId) return false;
    const day = a.date.slice(0, 10);
    return day >= from && day <= to;
  });
}

export async function getAppointmentById(id: string): Promise<Appointment | null> {
  if (isLiveId(id)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", id)
        .single();
      if (error || !data) return null;
      const [appointment] = await attachDisplayNames([mapAppointment(data)]);
      appointment.history = await getAppointmentHistory(id);
      return appointment;
    }
  }
  return appointments.find((a) => a.id === id) ?? null;
}

/** Alias matching the Phase-5 service contract. */
export const getAppointment = getAppointmentById;

/** Re-exported so callers can catch booking races without extra imports. */
export { BookingConflictError };

/** Audit trail for an appointment (auto-logged by a DB trigger when live). */
export async function getAppointmentHistory(
  appointmentId: string,
): Promise<AppointmentHistoryEntry[]> {
  if (isLiveId(appointmentId)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("appointment_history")
        .select("*")
        .eq("appointment_id", appointmentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapAppointmentHistoryEntry);
    }
  }
  return appointments.find((a) => a.id === appointmentId)?.history ?? [];
}

// ---------------------------------------------------------------------------
// Booking + transitions
// ---------------------------------------------------------------------------

async function loadForMutation(id: string): Promise<Appointment> {
  const current =
    isLiveId(id)
      ? await getAppointmentById(id)
      : (appointments.find((a) => a.id === id) ?? null);
  if (!current) throw new Error("Appointment not found.");
  return current;
}

function requireOwner(
  current: Appointment,
  actor: Actor,
  kind: "student" | "lecturer",
): void {
  if (!isSupabaseConfigured()) return; // mock preview: role-segmented pages
  if (actor.role === "admin") return;
  if (kind === "student" && actor.studentId === current.studentId) return;
  if (kind === "lecturer" && actor.lecturerId === current.lecturerId) return;
  throw new Error("You are not authorized to modify this appointment.");
}

/** Persist a mock transition + history entry (notifications by caller). */
async function applyMockTransition(
  id: string,
  status: AppointmentStatus,
  description: string | undefined,
  newStartDatetime?: string,
  newEndDatetime?: string,
): Promise<Appointment> {
  const index = appointments.findIndex((a) => a.id === id);
  if (index < 0) throw new Error("Appointment not found.");
  const now = new Date().toISOString();
  const updated: Appointment = {
    ...appointments[index],
    status,
    updatedAt: now,
    history: [
      ...appointments[index].history,
      {
        id: `hist-${Date.now()}`,
        date: now,
        action: historyActionLabel(status),
        description,
      },
    ],
  };
  if (newStartDatetime && newEndDatetime) {
    const start = splitDatetimeInTZ(newStartDatetime);
    const end = splitDatetimeInTZ(newEndDatetime);
    updated.date = start.date;
    updated.startTime = start.time;
    updated.endTime = end.time;
  }
  appointments[index] = updated;
  return updated;
}

async function performStatusChange(
  id: string,
  status: AppointmentStatus,
  options?: {
    description?: string;
    rejectionReason?: string;
    newStartDatetime?: string;
    newEndDatetime?: string;
  },
): Promise<Appointment> {
  const current = await loadForMutation(id);
  assertTransitionAllowed(current.status, status);

  if (isLiveId(id)) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase
          .from("appointments")
          .update({
            status: toDbAppointmentStatus(status),
            ...(options?.rejectionReason ? { rejection_reason: options.rejectionReason } : {}),
            ...(options?.newStartDatetime ? { start_datetime: options.newStartDatetime } : {}),
            ...(options?.newEndDatetime ? { end_datetime: options.newEndDatetime } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (error) throw error;
      } catch (e) {
        throw toFriendlyBookingError(e);
      }
      const updated = await getAppointmentById(id);
      if (!updated) throw new Error("Appointment not found.");
      return updated;
    }
  }

  // Mock: persist locally; history appended here, notification by caller.
  return applyMockTransition(
    id,
    status,
    options?.description,
    options?.newStartDatetime,
    options?.newEndDatetime,
  );
}

/**
 * Create a consultation request (always starts as `pending`).
 * The student id always comes from the authenticated session when live —
 * client-supplied ids are never trusted. The slot is revalidated against
 * the shared generator immediately before insert; the DB exclusion
 * constraint remains the atomic backstop (mapped to a friendly error).
 */
export async function createAppointment(input: NewAppointmentInput): Promise<Appointment> {
  if (input.type !== "in-person" && input.type !== "online") {
    throw new Error("Please select a valid consultation type.");
  }
  if (!input.reason || input.reason.trim().length < 5) {
    throw new Error("Please provide a reason (at least 5 characters).");
  }
  assertValidTimeRange(input.startTime, input.endTime);

  const live = isLive();
  let studentId = input.studentId;
  if (live) {
    const actor = await resolveActor();
    if (actor.role !== "student" || !actor.studentId) {
      throw new Error("You must be signed in as a student to book.");
    }
    studentId = actor.studentId;
  }

  // Lecturer must exist; course (when given) must exist and belong to them.
  const lecturer = await getLecturerById(input.lecturerId);
  if (!lecturer) throw new Error("The selected lecturer is no longer available.");
  let courseId = input.courseId;
  if (courseId) {
    const assigned = await getCoursesByLecturer(input.lecturerId);
    if (!assigned.some((c) => c.id === courseId)) {
      throw new Error("The selected course is not offered by this lecturer.");
    }
  } else {
    courseId = "";
  }

  // Slot must be in the future and currently available (race-checked).
  const slotStartMs = zonedWallToUtcMs(input.date, timeToMinutesStrict(input.startTime));
  if (!(slotStartMs > Date.now())) {
    throw new Error("This time slot is in the past. Please choose another slot.");
  }
  try {
    await assertSlotAvailable(input.lecturerId, input.date, input.startTime, input.endTime);
  } catch (e) {
    throw toFriendlyBookingError(e);
  }

  if (live) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("appointments")
          .insert({
            student_id: studentId,
            lecturer_id: input.lecturerId,
            course_id: courseId || null,
            start_datetime: combineDatetime(input.date, input.startTime),
            end_datetime: combineDatetime(input.date, input.endTime),
            consultation_type: toDbConsultationType(input.type),
            status: "pending",
            reason: input.reason.trim(),
            notes: input.notes?.trim() || null,
            location: input.location?.trim() || null,
          })
          .select()
          .single();
        if (error) throw error;
        const created = mapAppointment(data);
        created.history = await getAppointmentHistory(created.id);
        return created;
      } catch (e) {
        throw toFriendlyBookingError(e);
      }
    }
  }

  const now = new Date().toISOString();
  const created: Appointment = {
    id: `appt-${Date.now()}`,
    studentId,
    lecturerId: input.lecturerId,
    courseId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    type: input.type,
    status: "pending",
    reason: input.reason.trim(),
    notes: input.notes?.trim() || undefined,
    location: input.location?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    history: [
      {
        id: `hist-${Date.now()}`,
        date: now,
        action: "Requested",
        description: "Consultation request submitted",
      },
    ],
  };
  appointments.push(created);
  await createNotification({
    userId: input.lecturerId,
    title: "New consultation request",
    message: `You have a new consultation request for ${input.date} at ${input.startTime}.`,
    type: "request",
    appointmentId: created.id,
  });
  return created;
}

function timeToMinutesStrict(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new Error("Invalid time slot selected.");
  }
  return h * 60 + m;
}

/** Student or lecturer cancels their own appointment. */
export async function cancelAppointment(
  id: string,
  cancelledBy?: "student" | "lecturer",
): Promise<Appointment> {
  const current = await loadForMutation(id);
  assertTransitionAllowed(current.status, "cancelled");
  const actor = await resolveActor();
  if (isSupabaseConfigured()) {
    const owned =
      actor.role === "admin" ||
      (actor.studentId !== null && actor.studentId === current.studentId) ||
      (actor.lecturerId !== null && actor.lecturerId === current.lecturerId);
    if (!owned) throw new Error("You are not authorized to modify this appointment.");
  }
  const by =
    actor.role === "lecturer" ? "lecturer" : actor.role === "student" ? "student" : (cancelledBy ?? "student");

  if (isLiveId(id)) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase
          .from("appointments")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
      } catch (e) {
        throw toFriendlyBookingError(e);
      }
      const updated = await getAppointmentById(id);
      if (!updated) throw new Error("Appointment not found.");
      return updated;
    }
  }

  const updated = await applyMockTransition(
    id,
    "cancelled",
    `Cancelled by ${by}`,
  );
  await createNotification({
    userId: by === "student" ? current.lecturerId : current.studentId,
    title: "Consultation cancelled",
    message: `The consultation on ${current.date} at ${current.startTime} was cancelled.`,
    type: "cancellation",
    appointmentId: id,
  });
  return updated;
}

/** Lecturer approves a pending request. */
export async function approveAppointment(id: string): Promise<Appointment> {
  const current = await loadForMutation(id);
  assertTransitionAllowed(current.status, "approved");
  requireOwner(current, await resolveActor(), "lecturer");
  const updated = await performStatusChange(id, "approved", {
    description: "Request approved by lecturer",
  });
  if (!isLiveId(id)) {
    await createNotification({
      userId: current.studentId,
      title: "Consultation approved",
      message: `Your consultation on ${current.date} at ${current.startTime} was approved.`,
      type: "approval",
      appointmentId: id,
    });
  }
  return updated;
}

/** Lecturer rejects a pending request (reason recorded + notified). */
export async function rejectAppointment(id: string, reason?: string): Promise<Appointment> {
  const current = await loadForMutation(id);
  assertTransitionAllowed(current.status, "rejected");
  requireOwner(current, await resolveActor(), "lecturer");
  const cleanReason = reason?.trim() || undefined;
  const updated = await performStatusChange(id, "rejected", {
    description: cleanReason ? `Rejected by lecturer: ${cleanReason}` : "Request rejected by lecturer",
    rejectionReason: cleanReason,
  });
  if (!isLiveId(id)) {
    await createNotification({
      userId: current.studentId,
      title: "Consultation request rejected",
      message: cleanReason
        ? `Your request for ${current.date} at ${current.startTime} was not approved. Reason: ${cleanReason}`
        : `Your request for ${current.date} at ${current.startTime} was not approved.`,
      type: "rejection",
      appointmentId: id,
    });
  }
  return updated;
}

/** Lecturer marks an approved/rescheduled consultation completed. */
export async function markCompleted(id: string): Promise<Appointment> {
  const current = await loadForMutation(id);
  assertTransitionAllowed(current.status, "completed");
  requireOwner(current, await resolveActor(), "lecturer");
  const updated = await performStatusChange(id, "completed", {
    description: "Consultation marked as completed",
  });
  if (!isLiveId(id)) {
    await createNotification({
      userId: current.studentId,
      title: "Consultation completed",
      message: `Your consultation on ${current.date} was marked as completed.`,
      type: "system",
      appointmentId: id,
    });
  }
  return updated;
}

/** Lecturer marks a student as no-show. */
export async function markNoShow(id: string): Promise<Appointment> {
  const current = await loadForMutation(id);
  assertTransitionAllowed(current.status, "no-show");
  requireOwner(current, await resolveActor(), "lecturer");
  const updated = await performStatusChange(id, "no-show", {
    description: "Student marked as no-show",
  });
  if (!isLiveId(id)) {
    await createNotification({
      userId: current.studentId,
      title: "Marked as no-show",
      message: `You were marked as no-show for your consultation on ${current.date}.`,
      type: "system",
      appointmentId: id,
    });
  }
  return updated;
}

export interface RescheduleInput {
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Lecturer moves an appointment to another available slot.
 * Times change together with the status → `rescheduled`; the DB trigger
 * allows exactly this shape, the exclusion constraint rechecks conflicts,
 * and history + student notification follow automatically when live.
 */
export async function rescheduleAppointment(
  id: string,
  input: RescheduleInput,
): Promise<Appointment> {
  const current = await loadForMutation(id);
  assertTransitionAllowed(current.status, "rescheduled");
  const actor = await resolveActor();
  requireOwner(current, actor, "lecturer");
  assertValidTimeRange(input.startTime, input.endTime);

  const slotStartMs = zonedWallToUtcMs(input.date, timeToMinutesStrict(input.startTime));
  if (!(slotStartMs > Date.now())) {
    throw new Error("The new slot must be in the future.");
  }
  try {
    await assertSlotAvailable(current.lecturerId, input.date, input.startTime, input.endTime, {
      excludeAppointmentId: id,
    });
  } catch (e) {
    throw toFriendlyBookingError(e);
  }

  if (isLiveId(id)) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase
          .from("appointments")
          .update({
            status: "rescheduled",
            start_datetime: combineDatetime(input.date, input.startTime),
            end_datetime: combineDatetime(input.date, input.endTime),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (error) throw error;
      } catch (e) {
        throw toFriendlyBookingError(e);
      }
      const updated = await getAppointmentById(id);
      if (!updated) throw new Error("Appointment not found.");
      return updated;
    }
  }

  const updated = await performStatusChange(id, "rescheduled", {
    description: `Rescheduled to ${input.date} at ${input.startTime}`,
    newStartDatetime: combineDatetime(input.date, input.startTime),
    newEndDatetime: combineDatetime(input.date, input.endTime),
  });
  if (!isLiveId(id)) {
    await createNotification({
      userId: current.studentId,
      title: "Consultation rescheduled",
      message: `Your consultation was moved to ${input.date} at ${input.startTime}.`,
      type: "reschedule",
      appointmentId: id,
    });
  }
  return updated;
}

/**
 * Lecturer/admin field update (notes, location, meeting link, rejection
 * reason). Identities, times and status are immutable through this path —
 * use the dedicated transitions instead.
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
  const current = await loadForMutation(id);
  const actor = await resolveActor();
  if (isSupabaseConfigured() && actor.role === "student") {
    throw new Error("You are not authorized to modify this appointment.");
  }
  requireOwner(current, actor, "lecturer");

  if (isLiveId(id)) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase
          .from("appointments")
          .update({
            ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
            ...(patch.location !== undefined ? { location: patch.location } : {}),
            ...(patch.meetingLink !== undefined ? { meeting_link: patch.meetingLink } : {}),
            ...(patch.rejectionReason !== undefined
              ? { rejection_reason: patch.rejectionReason }
              : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (error) throw error;
      } catch (e) {
        throw toFriendlyBookingError(e);
      }
      const updated = await getAppointmentById(id);
      if (!updated) throw new Error("Appointment not found.");
      return updated;
    }
  }

  const index = appointments.findIndex((a) => a.id === id);
  if (index < 0) throw new Error("Appointment not found.");
  const updated: Appointment = {
    ...appointments[index],
    ...(patch.notes !== undefined ? { notes: patch.notes ?? undefined } : {}),
    ...(patch.location !== undefined ? { location: patch.location ?? undefined } : {}),
    ...(patch.meetingLink !== undefined ? { meetingLink: patch.meetingLink ?? undefined } : {}),
    updatedAt: new Date().toISOString(),
  };
  appointments[index] = updated;
  return updated;
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
  const current = await loadForMutation(id).catch(() => null);
  if (!current) return null;
  try {
    assertTransitionAllowed(current.status, status);
  } catch {
    return null;
  }

  if (isLiveId(id)) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("appointments")
        .update({
          status: toDbAppointmentStatus(status),
          ...(status === "rejected" && description
            ? { rejection_reason: description }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      const updated = mapAppointment(data);
      updated.history = await getAppointmentHistory(id);
      return attachDisplayNames([updated]).then((list) => list[0]);
    }
  }

  const now = new Date().toISOString();
  const updatedAppointment: Appointment = {
    ...current,
    status,
    updatedAt: now,
    history: [
      ...current.history,
      {
        id: `hist-${Date.now()}`,
        date: now,
        action: historyActionLabel(status),
        description,
      },
    ],
  };
  const index = appointments.findIndex((a) => a.id === current.id);
  if (index >= 0) appointments[index] = updatedAppointment;
  return updatedAppointment;
}
