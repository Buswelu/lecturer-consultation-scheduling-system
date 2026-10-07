/**
 * LCSS — repository actor + shared row helpers (server-only).
 *
 * Every repository function that enforces ownership takes an `Actor`
 * resolved from the verified PostgreSQL session (never from client input).
 * Rows are mapped to domain types through the shared mappers in
 * `lib/supabase/mappers` (pg rows share the Supabase snake_case shape).
 */
import "server-only";
import { queryOne } from "@/lib/db/query";
import type { PgSession } from "@/lib/auth/session";
import type { Tables } from "@/lib/db/database.types";

export interface Actor {
  profileId: string;
  role: PgSession["role"];
  studentId: string | null;
  lecturerId: string | null;
}

/** Ownership/authorization denial (mapped to HTTP 403 by route helpers). */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You are not authorized to perform this action.") {
    super(message);
  }
}

/** Resolve entity ids for a verified session. */
export async function resolveActor(session: PgSession): Promise<Actor> {
  const [student, lecturer] = await Promise.all([
    queryOne<{ id: string }>("select id from public.students where profile_id = $1", [
      session.userId,
    ]).catch(() => null),
    queryOne<{ id: string }>("select id from public.lecturers where profile_id = $1", [
      session.userId,
    ]).catch(() => null),
  ]);
  return {
    profileId: session.userId,
    role: session.role,
    studentId: student?.id ?? null,
    lecturerId: lecturer?.id ?? null,
  };
}

/** Actor for service-level tests (no HTTP involved). */
export async function actorForProfile(profileId: string): Promise<Actor> {
  const profile = await queryOne<{ role: PgSession["role"] }>(
    "select role from public.profiles where id = $1",
    [profileId],
  );
  if (!profile) throw new Error("Profile not found.");
  const fake: PgSession = {
    userId: profileId,
    email: "",
    username: "",
    role: profile.role,
    fullName: "",
  };
  return resolveActor(fake);
}

export type ProfilesRow = Tables<"profiles">;
export type StudentsRow = Tables<"students">;
export type LecturersRow = Tables<"lecturers">;
export type DepartmentsRow = Tables<"departments">;
export type CoursesRow = Tables<"courses">;
export type AvailabilityRow = Tables<"availability">;
export type AvailabilityExceptionsRow = Tables<"availability_exceptions">;
export type AppointmentsRow = Tables<"appointments">;
export type AppointmentHistoryRow = Tables<"appointment_history">;
export type NotificationsRow = Tables<"notifications">;
