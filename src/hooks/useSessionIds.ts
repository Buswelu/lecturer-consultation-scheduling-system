import * as React from "react";
import { getPgCurrentUser } from "@/lib/auth/client";

export interface StudentIdentity {
  loading: boolean;
  /** `students`-row id (PostgreSQL). Null when unavailable. */
  studentId: string | null;
  /** Profile id (for notifications). */
  notifUserId: string | null;
}

export interface LecturerIdentity {
  loading: boolean;
  /** `lecturers`-row id (PostgreSQL). Null when unavailable. */
  lecturerId: string | null;
  /** Profile id (for notifications). */
  notifUserId: string | null;
}

function usePgIdentity(kind: "student" | "lecturer"): {
  loading: boolean;
  entityId: string | null;
  notifUserId: string | null;
} {
  const [state, setState] = React.useState<{
    entityId: string | null;
    notifUserId: string | null;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getPgCurrentUser()
      .then((user) => {
        if (cancelled) return;
        if (user && user.role === kind) {
          setState({
            entityId: kind === "student" ? user.studentId : user.lecturerId,
            notifUserId: user.id,
          });
        } else {
          setState({ entityId: null, notifUserId: null });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ entityId: null, notifUserId: null });
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  if (!state) return { loading: true, entityId: null, notifUserId: null };
  return { loading: false, ...state };
}

/**
 * Resolve the signed-in student's entity + notification ids from the
 * PostgreSQL session (GET /api/pg-auth/me).
 */
export function useStudentIdentity(): StudentIdentity {
  const { loading, entityId, notifUserId } = usePgIdentity("student");
  return { loading, studentId: entityId, notifUserId };
}

/**
 * Resolve the signed-in lecturer's entity + notification ids from the
 * PostgreSQL session (GET /api/pg-auth/me).
 */
export function useLecturerIdentity(): LecturerIdentity {
  const { loading, entityId, notifUserId } = usePgIdentity("lecturer");
  return { loading, lecturerId: entityId, notifUserId };
}
