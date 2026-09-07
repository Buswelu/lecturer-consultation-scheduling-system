import { getSupabase } from "@/lib/supabase/client";
import { appointments } from "@/lib/mock-data";
import type { Appointment, AppointmentStatus, ConsultationType } from "@/lib/types";

const IS_MOCK = true;

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

export async function getAppointments(filters?: AppointmentFilters): Promise<Appointment[]> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      let query = supabase.from("appointments").select("*");
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.lecturerId) query = query.eq("lecturer_id", filters.lecturerId);
      if (filters?.courseId) query = query.eq("course_id", filters.courseId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data as Appointment[];
    }
  }

  let result = [...appointments];
  if (filters?.status) result = result.filter((a) => a.status === filters.status);
  if (filters?.lecturerId) result = result.filter((a) => a.lecturerId === filters.lecturerId);
  if (filters?.courseId) result = result.filter((a) => a.courseId === filters.courseId);
  return result;
}

export async function getAppointmentsByStudent(studentId: string): Promise<Appointment[]> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Appointment[];
    }
  }
  return appointments.filter((a) => a.studentId === studentId);
}

export async function getAppointmentsByLecturer(lecturerId: string): Promise<Appointment[]> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("lecturer_id", lecturerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Appointment[];
    }
  }
  return appointments.filter((a) => a.lecturerId === lecturerId);
}

export async function getAppointmentById(id: string): Promise<Appointment | null> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", id)
        .single();
      if (error) return null;
      return data as Appointment;
    }
  }
  return appointments.find((a) => a.id === id) ?? null;
}

export async function createAppointment(input: NewAppointmentInput): Promise<Appointment> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("appointments")
        .insert({
          student_id: input.studentId,
          lecturer_id: input.lecturerId,
          course_id: input.courseId,
          date: input.date,
          start_time: input.startTime,
          end_time: input.endTime,
          type: input.type,
          reason: input.reason,
          notes: input.notes,
          location: input.location,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;
      return data as Appointment;
    }
  }

  const now = new Date().toISOString();
  const newAppointment: Appointment = {
    id: `appt-${Date.now()}`,
    ...input,
    status: "pending",
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
  return newAppointment;
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  description?: string,
): Promise<Appointment | null> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("appointments")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Appointment;
    }
  }

  const appointment = appointments.find((a) => a.id === id);
  if (!appointment) return null;

  const now = new Date().toISOString();
  const updatedAppointment: Appointment = {
    ...appointment,
    status,
    updatedAt: now,
    history: [
      ...appointment.history,
      {
        id: `hist-${Date.now()}`,
        date: now,
        action: status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : status === "cancelled" ? "Cancelled" : status === "completed" ? "Completed" : status.charAt(0).toUpperCase() + status.slice(1).replace("-", " "),
        description,
      },
    ],
  };
  return updatedAppointment;
}
