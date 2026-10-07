/**
 * LCSS — PostgreSQL database types (moved from `lib/supabase/` in Stage 7;
 * the row shapes are shared with the pg repositories).
 *
 * These types mirror the schema in `db/migrations/` and give the
 * repositories full type safety for table names, columns and
 * insert/update payloads. Hand-maintained: update alongside migrations.
 */

export type DbRole = "student" | "lecturer" | "admin";

export type DbConsultationType = "in_person" | "online";

export type DbAppointmentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "completed"
  | "rescheduled"
  | "no_show";

export type DbNotificationType =
  | "appointment_request"
  | "appointment_approved"
  | "appointment_rejected"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "appointment_reminder"
  | "system";

/** 0 = Sunday … 6 = Saturday (matches PostgreSQL EXTRACT(DOW …)). */
export type DbDayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
          avatar_url: string | null;
          role: DbRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          role: DbRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          role?: DbRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      departments: {
        Row: {
          id: string;
          name: string;
          code: string | null;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code?: string | null;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string | null;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      students: {
        Row: {
          id: string;
          profile_id: string;
          student_number: string | null;
          programme: string | null;
          department_id: string | null;
          year_of_study: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          student_number?: string | null;
          programme?: string | null;
          department_id?: string | null;
          year_of_study?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          student_number?: string | null;
          programme?: string | null;
          department_id?: string | null;
          year_of_study?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "students_profile_id_fkey"; columns: ["profile_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "students_department_id_fkey"; columns: ["department_id"]; referencedRelation: "departments"; referencedColumns: ["id"] },
        ];
      };
      lecturers: {
        Row: {
          id: string;
          profile_id: string;
          staff_number: string | null;
          department_id: string | null;
          office: string | null;
          bio: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          staff_number?: string | null;
          department_id?: string | null;
          office?: string | null;
          bio?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          staff_number?: string | null;
          department_id?: string | null;
          office?: string | null;
          bio?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "lecturers_profile_id_fkey"; columns: ["profile_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "lecturers_department_id_fkey"; columns: ["department_id"]; referencedRelation: "departments"; referencedColumns: ["id"] },
        ];
      };
      courses: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          department_id: string | null;
          is_active: boolean;
          credits: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          department_id?: string | null;
          is_active?: boolean;
          credits?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          department_id?: string | null;
          is_active?: boolean;
          credits?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "courses_department_id_fkey"; columns: ["department_id"]; referencedRelation: "departments"; referencedColumns: ["id"] },
        ];
      };
      lecturer_courses: {
        Row: {
          id: string;
          lecturer_id: string;
          course_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          lecturer_id: string;
          course_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          lecturer_id?: string;
          course_id?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "lecturer_courses_lecturer_id_fkey"; columns: ["lecturer_id"]; referencedRelation: "lecturers"; referencedColumns: ["id"] },
          { foreignKeyName: "lecturer_courses_course_id_fkey"; columns: ["course_id"]; referencedRelation: "courses"; referencedColumns: ["id"] },
        ];
      };
      availability: {
        Row: {
          id: string;
          lecturer_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lecturer_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lecturer_id?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "availability_lecturer_id_fkey"; columns: ["lecturer_id"]; referencedRelation: "lecturers"; referencedColumns: ["id"] },
        ];
      };
      availability_exceptions: {
        Row: {
          id: string;
          lecturer_id: string;
          start_datetime: string;
          end_datetime: string;
          reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lecturer_id: string;
          start_datetime: string;
          end_datetime: string;
          reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lecturer_id?: string;
          start_datetime?: string;
          end_datetime?: string;
          reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "availability_exceptions_lecturer_id_fkey"; columns: ["lecturer_id"]; referencedRelation: "lecturers"; referencedColumns: ["id"] },
        ];
      };
      appointments: {
        Row: {
          id: string;
          student_id: string;
          lecturer_id: string;
          course_id: string | null;
          start_datetime: string;
          end_datetime: string;
          consultation_type: DbConsultationType;
          status: DbAppointmentStatus;
          reason: string;
          notes: string | null;
          location: string | null;
          meeting_link: string | null;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          lecturer_id: string;
          course_id?: string | null;
          start_datetime: string;
          end_datetime: string;
          consultation_type: DbConsultationType;
          status?: DbAppointmentStatus;
          reason: string;
          notes?: string | null;
          location?: string | null;
          meeting_link?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          lecturer_id?: string;
          course_id?: string | null;
          start_datetime?: string;
          end_datetime?: string;
          consultation_type?: DbConsultationType;
          status?: DbAppointmentStatus;
          reason?: string;
          notes?: string | null;
          location?: string | null;
          meeting_link?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "appointments_student_id_fkey"; columns: ["student_id"]; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "appointments_lecturer_id_fkey"; columns: ["lecturer_id"]; referencedRelation: "lecturers"; referencedColumns: ["id"] },
          { foreignKeyName: "appointments_course_id_fkey"; columns: ["course_id"]; referencedRelation: "courses"; referencedColumns: ["id"] },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          message: string;
          type: DbNotificationType | null;
          is_read: boolean;
          appointment_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          message: string;
          type?: DbNotificationType | null;
          is_read?: boolean;
          appointment_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          message?: string;
          type?: DbNotificationType | null;
          is_read?: boolean;
          appointment_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "notifications_user_id_fkey"; columns: ["user_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "notifications_appointment_id_fkey"; columns: ["appointment_id"]; referencedRelation: "appointments"; referencedColumns: ["id"] },
        ];
      };
      appointment_history: {
        Row: {
          id: string;
          appointment_id: string;
          changed_by: string;
          old_status: DbAppointmentStatus | null;
          new_status: DbAppointmentStatus | null;
          action: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          appointment_id: string;
          changed_by: string;
          old_status?: DbAppointmentStatus | null;
          new_status?: DbAppointmentStatus | null;
          action: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          appointment_id?: string;
          changed_by?: string;
          old_status?: DbAppointmentStatus | null;
          new_status?: DbAppointmentStatus | null;
          action?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "appointment_history_appointment_id_fkey"; columns: ["appointment_id"]; referencedRelation: "appointments"; referencedColumns: ["id"] },
          { foreignKeyName: "appointment_history_changed_by_fkey"; columns: ["changed_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      auth_rate_limits: {
        Row: {
          id: string;
          key: string;
          attempts: number;
          first_attempt_at: string;
          blocked_until: string | null;
          last_attempt_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          attempts?: number;
          first_attempt_at?: string;
          blocked_until?: string | null;
          last_attempt_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          attempts?: number;
          first_attempt_at?: string;
          blocked_until?: string | null;
          last_attempt_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: string | null };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      own_student_id: { Args: Record<string, never>; Returns: string | null };
      own_lecturer_id: { Args: Record<string, never>; Returns: string | null };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
