/**
 * Shared fixtures for data-layer repository tests (test-only).
 *
 * Builds real student/lecturer/admin accounts with suite-scoped emails and
 * resolves repository actors. Everything created here cascades away when
 * the users are deleted.
 */
import { getPool } from "@/lib/db/pool";
import { createPgAdmin, registerPgUser } from "@/lib/auth/users";
import type { Actor } from "./types";
import { actorForProfile } from "./types";
import {
  assertTestDatabase,
  cleanupTestData,
  closeTestPool,
  setSuiteTag,
  testEmail,
  testIp,
} from "@/lib/auth/test-helpers";

export {
  assertTestDatabase,
  cleanupTestData,
  closeTestPool,
  setSuiteTag,
  testEmail,
  testIp,
};

export interface Fixture {
  studentActor: Actor;
  studentEmail: string;
  lecturerActor: Actor;
  lecturerEmail: string;
  adminActor: Actor;
  courseId: string;
}

export async function setupSuite(tag: string): Promise<void> {
  setSuiteTag(tag);
  await assertTestDatabase();
}

export async function teardownSuite(extra?: () => Promise<void>): Promise<void> {
  if (extra) await extra().catch(() => undefined);
  await cleanupTestData();
  await closeTestPool();
}

/** Remove non-cascading test rows (departments/courses) by name/code pattern. */
export async function cleanupAcademic(pattern: string): Promise<void> {
  // Course codes are `TDB<digits>` (no dash): keep the % wildcard.
  const coursePattern = pattern.endsWith("-%") ? `${pattern.slice(0, -2)}%` : pattern;
  await getPool().query("delete from public.courses where code like $1", [coursePattern]);
  await getPool().query("delete from public.departments where name like $1", [pattern]);
}

/** Give a lecturer all-day rules so tests can book any future date. */
export async function ensureFullWeek(actor: Actor, lecturerId: string): Promise<void> {
  const { addRule } = await import("./availability");
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  for (const dayOfWeek of days) {
    await addRule(actor, lecturerId, {
      dayOfWeek,
      startTime: "08:00",
      endTime: "18:00",
      duration: 30,
    });
  }
}

/** One student + one lecturer + one admin, all verified actors. */
export async function makeFixture(tag: string): Promise<Fixture> {
  const studentEmail = testEmail(`${tag}-student`);
  const lecturerEmail = testEmail(`${tag}-lecturer`);
  const adminEmail = testEmail(`${tag}-admin`);
  const student = await registerPgUser({
    email: studentEmail,
    password: "fixture-pass-123",
    fullName: "Fixture Student",
    role: "student",
    ip: testIp(),
  });
  const lecturer = await registerPgUser({
    email: lecturerEmail,
    password: "fixture-pass-123",
    fullName: "Fixture Lecturer",
    role: "lecturer",
    ip: testIp(),
  });
  const admin = await createPgAdmin({
    email: adminEmail,
    password: "fixture-pass-123",
    fullName: "Fixture Admin",
  });
  // Give the fixture lecturer a course (seed courses exist).
  const { rows } = await getPool().query<{ id: string }>(
    "select id from public.courses order by code limit 1",
  );
  const courseId: string = rows[0].id;
  const lecturerActor = await actorForProfile(lecturer.user.id);
  await getPool().query(
    "insert into public.lecturer_courses (lecturer_id, course_id) values ($1, $2) on conflict do nothing",
    [lecturerActor.lecturerId, courseId],
  );
  return {
    studentActor: await actorForProfile(student.user.id),
    studentEmail,
    lecturerActor,
    lecturerEmail,
    adminActor: await actorForProfile(admin.id),
    courseId,
  };
}
