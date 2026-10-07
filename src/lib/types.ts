export type UserRole = "student" | "lecturer" | "admin";

export type UserStatus = "active" | "inactive" | "suspended";

export type AppointmentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "no-show";

export type ConsultationType = "in-person" | "online";

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string;
  status: "active" | "inactive";
  createdAt: string;
}

export interface Course {
  id: string;
  title: string;
  code: string;
  departmentId: string;
  lecturerIds: string[];
  credits?: number;
  description?: string;
  status: "active" | "inactive";
  createdAt: string;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  phone?: string;
  photoUrl?: string;
  status: UserStatus;
  departmentId?: string;
  programme?: string;
  office?: string;
  bio?: string;
  createdAt: string;
}

export interface StudentProfile extends User {
  role: "student";
  studentId?: string;
  programme?: string;
  yearOfStudy?: number;
  departmentId: string;
}

export interface LecturerProfile extends User {
  role: "lecturer";
  employeeId?: string;
  departmentId: string;
  office: string;
  bio: string;
  courses: string[];
  consultationTypes: ConsultationType[];
  /** Embedded directory display data (populated by list/detail reads). */
  departmentName?: string;
  courseNames?: string[];
}

export interface Appointment {
  id: string;
  studentId: string;
  lecturerId: string;
  courseId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: ConsultationType;
  status: AppointmentStatus;
  reason: string;
  notes?: string;
  location?: string;
  meetingLink?: string;
  createdAt: string;
  updatedAt: string;
  history: AppointmentHistoryEntry[];
  /** Display names, populated by live reads (batched joins). Absent in mock. */
  lecturerName?: string;
  studentName?: string;
  courseName?: string;
}

export interface AppointmentHistoryEntry {
  id: string;
  date: string;
  action: string;
  description?: string;
}

export interface AvailabilityRule {
  id: string;
  lecturerId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  duration: number;
  breaks?: BreakPeriod[];
  unavailableDates?: string[];
}

export interface BreakPeriod {
  startTime: string;
  endTime: string;
}

/** One-off unavailable period (maps `availability_exceptions`). */
export interface AvailabilityException {
  id: string;
  lecturerId: string;
  startDatetime: string;
  endDatetime: string;
  reason?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  type:
    | "appointment"
    | "request"
    | "approval"
    | "rejection"
    | "cancellation"
    | "reschedule"
    | "reminder"
    | "system";
  appointmentId?: string;
  createdAt: string;
}
