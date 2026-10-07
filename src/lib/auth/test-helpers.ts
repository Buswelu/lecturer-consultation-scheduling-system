/**
 * Shared helpers for self-managed auth tests (test-only, never imported by
 * app code). All tests run against Consultation_db and clean up after
 * themselves — no residue is left behind.
 */
import { getPool } from "@/lib/db/pool";
import { closePool } from "@/lib/db/pool";

export const TEST_IP_PREFIX = "pgtest-";

let counter = 0;
let suiteTag = "pgtest";

/**
 * Scope emails/keys to one test file (call in beforeAll). Parallel workers
 * share one database, so each file cleans up only its own rows.
 */
export function setSuiteTag(tag: string): void {
  suiteTag = tag;
}

/** Unique test email, e.g. treg-student-3-x9q2@example.com. */
export function testEmail(tag: string): string {
  counter += 1;
  return `${suiteTag}-${tag}-${counter}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Unique test IP key fragment (dodges the register limiter by default). */
export function testIp(): string {
  counter += 1;
  return `${suiteTag}-ip-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Refuse to run the suite against any database but Consultation_db. */
export async function assertTestDatabase(): Promise<void> {
  const { rows } = await getPool().query<{ database: string }>(
    "select current_database() as database",
  );
  if (rows[0].database !== "Consultation_db") {
    throw new Error(
      `Auth tests refuse to run against database "${rows[0].database}".`,
    );
  }
}

/** Remove every row created by this suite (dependency-ordered deletes). */
export async function cleanupTestData(): Promise<void> {
  // Supabase schema parity: appointment_history.changed_by and
  // appointments.student_id/lecturer_id have NO cascade, and notifications
  // belong to profiles — so delete in dependency order. Notifications with
  // appointment links are nulled automatically (SET NULL); profile-owned
  // rows cascade with users.
  const pool = getPool();
  const tag = `${suiteTag}-%@example.com`;
  await pool.query(
    `delete from public.appointment_history where appointment_id in (
       select a.id from public.appointments a
        where a.student_id in (select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email like $1)
           or a.lecturer_id in (select l.id from public.lecturers l join public.profiles p on p.id = l.profile_id where p.email like $1)
     )`,
    [tag],
  );
  await pool.query(
    `delete from public.appointments where student_id in
       (select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email like $1)
        or lecturer_id in
       (select l.id from public.lecturers l join public.profiles p on p.id = l.profile_id where p.email like $1)`,
    [tag],
  );
  await pool.query(
    `delete from public.appointment_history where changed_by in
       (select id from public.profiles where email like $1)`,
    [tag],
  );
  await pool.query(`delete from public.users where email like $1`, [tag]);
  await pool.query(`delete from public.auth_rate_limits where key like $1`, [`%${suiteTag}%`]);
}

export async function closeTestPool(): Promise<void> {
  await closePool();
}
