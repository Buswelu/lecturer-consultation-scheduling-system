/**
 * LCSS — mappers between PostgreSQL rows (snake_case) and the existing
 * frontend domain types (`src/lib/types.ts`, camelCase).
 *
 * All repository reads go through these functions, so the UI never depends
 * on raw column names. Known gaps (documented at each site):
 *  - `profiles` has no `status` column → domain `status` maps to "active".
 *  - `availability` has no `duration`/`breaks` columns → reads default to
 *    30 min, no breaks (scheduling inputs, not stored).
 *  - `lecturers` has no `consultation_types` column → defaults to both.
 *  - Entity ids: domain `StudentProfile.id`/`LecturerProfile.id` map to the
 *    `students`/`lecturers` row ids (the FK targets); the auth/profile id is
 *    separate. `Notification.userId` maps to the profile id.
 */
import type {
  Appointment,
  AppointmentHistoryEntry,
  AppointmentStatus,
  AvailabilityException,
  AvailabilityRule,
  ConsultationType,
  Course,
  DayOfWeek,
  Department,
  LecturerProfile,
  Notification,
  StudentProfile,
} from "@/lib/types";
import type {
  DbAppointmentStatus,
  DbConsultationType,
  DbNotificationType,
  Tables,
} from "./database.types";
import { splitDatetimeInTZ, wallToISO } from "@/lib/scheduling/datetime";

// ---------------------------------------------------------------------------
// enums
// ---------------------------------------------------------------------------

const DB_DAY_TO_NAME: Record<number, DayOfWeek> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

const NAME_TO_DB_DAY: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function dbDayToName(day: number): DayOfWeek {
  return DB_DAY_TO_NAME[day] ?? "monday";
}

export function dayNameToDbDay(day: DayOfWeek): number {
  return NAME_TO_DB_DAY[day];
}

export function toDbAppointmentStatus(status: AppointmentStatus): DbAppointmentStatus {
  return status === "no-show" ? "no_show" : status;
}

export function fromDbAppointmentStatus(status: DbAppointmentStatus): AppointmentStatus {
  return status === "no_show" ? "no-show" : status;
}

export function toDbConsultationType(type: ConsultationType): DbConsultationType {
  return type === "in-person" ? "in_person" : "online";
}

export function fromDbConsultationType(type: DbConsultationType): ConsultationType {
  return type === "in_person" ? "in-person" : "online";
}

const DB_NOTIFICATION_TO_DOMAIN: Record<string, Notification["type"]> = {
  appointment_request: "request",
  appointment_approved: "approval",
  appointment_rejected: "rejection",
  appointment_cancelled: "cancellation",
  appointment_rescheduled: "reschedule",
  appointment_reminder: "reminder",
  system: "system",
  appointment: "appointment",
};

const DOMAIN_NOTIFICATION_TO_DB: Record<Notification["type"], DbNotificationType> = {
  appointment: "appointment_request",
  request: "appointment_request",
  approval: "appointment_approved",
  rejection: "appointment_rejected",
  cancellation: "appointment_cancelled",
  reschedule: "appointment_rescheduled",
  reminder: "appointment_reminder",
  system: "system",
};

export function fromDbNotificationType(
  type: DbNotificationType | null,
): Notification["type"] {
  if (!type) return "system";
  return DB_NOTIFICATION_TO_DOMAIN[type] ?? "system";
}

export function toDbNotificationType(
  type: Notification["type"],
): DbNotificationType {
  return DOMAIN_NOTIFICATION_TO_DB[type];
}

// ---------------------------------------------------------------------------
// reference data
// ---------------------------------------------------------------------------

export function mapDepartment(row: Tables<"departments">): Department {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? "",
    description: row.description ?? undefined,
    status: row.is_active ? "active" : "inactive",
    createdAt: row.created_at,
  };
}

export function mapCourse(
  row: Tables<"courses">,
  lecturerIds: string[] = [],
): Course {
  return {
    id: row.id,
    title: row.name,
    code: row.code,
    departmentId: row.department_id ?? "",
    lecturerIds,
    credits: row.credits,
    description: row.description ?? undefined,
    status: row.is_active ? "active" : "inactive",
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

/**
 * Admin profiles have no students/lecturers row. They are shaped into the
 * shared user union so admin list pages keep working; the cast is contained
 * here (never `any`) and mirrors the existing mock behaviour.
 */
export function mapAdminProfile(
  profile: Tables<"profiles">,
): StudentProfile | LecturerProfile {
  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email ?? "",
    role: "admin",
    phone: profile.phone ?? undefined,
    photoUrl: profile.avatar_url ?? undefined,
    status: "active",
    createdAt: profile.created_at,
  } as unknown as StudentProfile | LecturerProfile;
}

export function mapStudentProfile(
  profile: Tables<"profiles">,
  student: Tables<"students">,
): StudentProfile {
  return {
    id: student.id,
    fullName: profile.full_name,
    email: profile.email ?? "",
    role: "student",
    phone: profile.phone ?? undefined,
    photoUrl: profile.avatar_url ?? undefined,
    // Phase-2 schema has no profile status column; all DB users are active.
    status: "active",
    departmentId: student.department_id ?? "",
    programme: student.programme ?? undefined,
    studentId: student.student_number ?? undefined,
    yearOfStudy: student.year_of_study ?? undefined,
    createdAt: profile.created_at,
  };
}

export function mapLecturerProfile(
  profile: Tables<"profiles">,
  lecturer: Tables<"lecturers">,
  courseIds: string[] = [],
): LecturerProfile {
  return {
    id: lecturer.id,
    fullName: profile.full_name,
    email: profile.email ?? "",
    role: "lecturer",
    phone: profile.phone ?? undefined,
    photoUrl: profile.avatar_url ?? undefined,
    // Phase-2 schema has no profile status column; all DB users are active.
    status: "active",
    departmentId: lecturer.department_id ?? "",
    office: lecturer.office ?? "",
    bio: lecturer.bio ?? "",
    courses: courseIds,
    // Phase-2 schema has no consultation-types column; default to both.
    consultationTypes: ["in-person", "online"],
    employeeId: lecturer.staff_number ?? undefined,
    createdAt: profile.created_at,
  };
}

// ---------------------------------------------------------------------------
// availability
// ---------------------------------------------------------------------------

export const DEFAULT_SLOT_DURATION_MINUTES = 30;

export function mapAvailabilityRule(
  row: Tables<"availability">,
): AvailabilityRule {
  return {
    id: row.id,
    lecturerId: row.lecturer_id,
    dayOfWeek: dbDayToName(row.day_of_week),
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    // Phase-2 schema stores no duration/breaks (Phase 3 slot generation).
    duration: DEFAULT_SLOT_DURATION_MINUTES,
    breaks: [],
    unavailableDates: [],
  };
}

export function mapAvailabilityException(
  row: Tables<"availability_exceptions">,
): AvailabilityException {
  return {
    id: row.id,
    lecturerId: row.lecturer_id,
    startDatetime: row.start_datetime,
    endDatetime: row.end_datetime,
    reason: row.reason ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// appointments
// ---------------------------------------------------------------------------

/** Split an ISO timestamptz into institution wall-clock date + HH:mm parts. */
export function splitDatetime(iso: string): { date: string; time: string } {
  return splitDatetimeInTZ(iso);
}

export function mapAppointment(row: Tables<"appointments">): Appointment {
  const start = splitDatetime(row.start_datetime);
  const end = splitDatetime(row.end_datetime);
  return {
    id: row.id,
    studentId: row.student_id,
    lecturerId: row.lecturer_id,
    courseId: row.course_id ?? "",
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    type: fromDbConsultationType(row.consultation_type),
    status: fromDbAppointmentStatus(row.status),
    reason: row.reason,
    notes: row.notes ?? undefined,
    location: row.location ?? undefined,
    meetingLink: row.meeting_link ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Populated separately via getAppointmentHistory().
    history: [],
  };
}

/**
 * Combine a wall-clock date + HH:mm (institution timezone) into an ISO
 * UTC datetime for inserts. Replaces naive concatenation (which stored
 * EAT wall times as UTC, shifting every booking by the zone offset).
 */
export function combineDatetime(date: string, time: string): string {
  return wallToISO(date, time);
}

const HISTORY_ACTION_LABELS: Record<string, string> = {
  created: "Requested",
  status_changed: "Updated",
};

export function mapAppointmentHistoryEntry(
  row: Tables<"appointment_history">,
): AppointmentHistoryEntry {
  const transition =
    row.old_status && row.new_status
      ? `${fromDbAppointmentStatus(row.old_status)} → ${fromDbAppointmentStatus(row.new_status)}`
      : undefined;
  return {
    id: row.id,
    date: row.created_at,
    action: HISTORY_ACTION_LABELS[row.action] ?? row.action,
    description: row.notes ?? transition,
  };
}

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------

export function mapNotification(row: Tables<"notifications">): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    read: row.is_read,
    type: fromDbNotificationType(row.type),
    appointmentId: row.appointment_id ?? undefined,
    createdAt: row.created_at,
  };
}
