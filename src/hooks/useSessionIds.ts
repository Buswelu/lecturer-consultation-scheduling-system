import * as React from "react";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getCurrentLecturer, getCurrentStudent } from "@/lib/supabase/auth";

export interface StudentIdentity {
  loading: boolean;
  /** `students`-row id live, `"stud-1"` in mock preview. Null when unavailable. */
  studentId: string | null;
  /** Profile id live (for notifications), mock user id otherwise. */
  notifUserId: string | null;
}

export interface LecturerIdentity {
  loading: boolean;
  /** `lecturers`-row id live, `"lec-1"` in mock preview. Null when unavailable. */
  lecturerId: string | null;
  /** Profile id live (for notifications), mock user id otherwise. */
  notifUserId: string | null;
}

/**
 * Resolve the signed-in student's entity + notification ids.
 * Falls back to mock ids only when Supabase is unconfigured.
 */
export function useStudentIdentity(): StudentIdentity {
  const [state, setState] = React.useState<{
    studentId: string | null;
    notifUserId: string | null;
  } | null>(() =>
    isSupabaseConfigured() ? null : { studentId: "stud-1", notifUserId: "stud-1" },
  );

  React.useEffect(() => {
    if (state !== null) return;
    let cancelled = false;
    getCurrentStudent()
      .then((current) => {
        if (cancelled) return;
        if (current) {
          setState({ studentId: current.student.id, notifUserId: current.profile.id });
        } else {
          setState({ studentId: null, notifUserId: null });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ studentId: null, notifUserId: null });
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (!state) return { loading: true, studentId: null, notifUserId: null };
  return { loading: false, ...state };
}

/**
 * Resolve the signed-in lecturer's entity + notification ids.
 * Falls back to mock ids only when Supabase is unconfigured.
 */
export function useLecturerIdentity(): LecturerIdentity {
  const [state, setState] = React.useState<{
    lecturerId: string | null;
    notifUserId: string | null;
  } | null>(() =>
    isSupabaseConfigured() ? null : { lecturerId: "lec-1", notifUserId: "lec-1" },
  );

  React.useEffect(() => {
    if (state !== null) return;
    let cancelled = false;
    getCurrentLecturer()
      .then((current) => {
        if (cancelled) return;
        if (current) {
          setState({ lecturerId: current.lecturer.id, notifUserId: current.profile.id });
        } else {
          setState({ lecturerId: null, notifUserId: null });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ lecturerId: null, notifUserId: null });
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (!state) return { loading: true, lecturerId: null, notifUserId: null };
  return { loading: false, ...state };
}
