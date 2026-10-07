import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { createSession } from "@/lib/auth/session";
import { GET as listLecturers } from "@/app/api/lecturers/route";
import { GET as listAppointments, POST as bookAppointment } from "@/app/api/appointments/route";
import { PATCH as transitionAppointment } from "@/app/api/appointments/[id]/route";
import { POST as createAvailability } from "@/app/api/availability/route";
import { GET as listNotifications } from "@/app/api/notifications/route";
import { GET as adminReports } from "@/app/api/admin/reports/route";
import { GET as adminStudents } from "@/app/api/admin/students/route";
import {
  ensureFullWeek,
  makeFixture,
  setupSuite,
  teardownSuite,
} from "@/lib/db/repositories/fixtures";
import type { Fixture } from "@/lib/db/repositories/fixtures";

function stub(
  url: string,
  token: string | null,
  init?: { method?: string; body?: unknown },
): NextRequest {
  const headers = new Headers();
  if (token) headers.set("cookie", `${SESSION_COOKIE_NAME}=${token}`);
  return {
    headers,
    nextUrl: new URL(url),
    json: async () => (init?.body === undefined ? {} : init.body),
  } as unknown as NextRequest;
}

let fx: Fixture;
let studentToken = "";
let lecturerToken = "";
let adminToken = "";

function futureDate(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86400000);
  return new Date(d.getTime() + 3 * 3600000).toISOString().slice(0, 10);
}

beforeAll(async () => {
  await setupSuite("tdbroutes");
  fx = await makeFixture("routes");
  await ensureFullWeek(fx.lecturerActor, fx.lecturerActor.lecturerId as string);
  studentToken = (await createSession(fx.studentActor.profileId)).token;
  lecturerToken = (await createSession(fx.lecturerActor.profileId)).token;
  adminToken = (await createSession(fx.adminActor.profileId)).token;
});

afterAll(async () => {
  await teardownSuite();
});

describe("data API authorization matrix", () => {
  it("anonymous requests are rejected", async () => {
    expect((await listLecturers(stub("http://x/api/lecturers", null))).status).toBe(401);
    expect((await listAppointments(stub("http://x/api/appointments", null))).status).toBe(401);
    expect(
      (await bookAppointment(stub("http://x/api/appointments", null, { method: "POST", body: {} })))
        .status,
    ).toBe(401);
    expect((await listNotifications(stub("http://x/api/notifications", null))).status).toBe(401);
    expect((await adminReports(stub("http://x/api/admin/reports", null))).status).toBe(401);
    expect((await adminStudents(stub("http://x/api/admin/students", null))).status).toBe(401);
  });

  it("student browses directory, books, and manages own booking", async () => {
    const dir = await listLecturers(stub("http://x/api/lecturers", studentToken));
    expect(dir.status).toBe(200);
    const booked = await bookAppointment(
      stub("http://x/api/appointments", studentToken, {
        method: "POST",
        body: {
          lecturerId: fx.lecturerActor.lecturerId,
          courseId: fx.courseId,
          date: futureDate(30),
          startTime: "10:00",
          endTime: "10:30",
          type: "in-person",
          reason: "Route-level booking probe",
        },
      }),
    );
    expect(booked.status).toBe(201);
    const created = (await booked.json()) as { appointment: { id: string } };
    // Student cannot approve (lecturer-only transition).
    const denied = await transitionAppointment(
      stub(`http://x/api/appointments/${created.appointment.id}`, studentToken, {
        method: "PATCH",
        body: { action: "approve" },
      }),
      { params: Promise.resolve({ id: created.appointment.id }) },
    );
    expect(denied.status).toBe(403);
    // Malformed actions are rejected.
    const bad = await transitionAppointment(
      stub(`http://x/api/appointments/${created.appointment.id}`, studentToken, {
        method: "PATCH",
        body: { action: "explode" },
      }),
      { params: Promise.resolve({ id: created.appointment.id }) },
    );
    expect(bad.status).toBe(400);
    // Student can cancel own booking.
    const cancelled = await transitionAppointment(
      stub(`http://x/api/appointments/${created.appointment.id}`, studentToken, {
        method: "PATCH",
        body: { action: "cancel" },
      }),
      { params: Promise.resolve({ id: created.appointment.id }) },
    );
    expect(cancelled.status).toBe(200);
  });

  it("lecturer cannot book and cannot touch admin APIs", async () => {
    const booking = await bookAppointment(
      stub("http://x/api/appointments", lecturerToken, {
        method: "POST",
        body: {
          lecturerId: fx.lecturerActor.lecturerId,
          courseId: fx.courseId,
          date: futureDate(31),
          startTime: "10:00",
          endTime: "10:30",
          type: "online",
          reason: "Lecturer must not book",
        },
      }),
    );
    expect([401, 403]).toContain(booking.status);
    expect((await adminReports(stub("http://x/api/admin/reports", lecturerToken))).status).toBe(
      403,
    );
    expect((await adminStudents(stub("http://x/api/admin/students", lecturerToken))).status).toBe(
      403,
    );
  });

  it("lecturer manages own availability; student cannot", async () => {
    const created = await createAvailability(
      stub("http://x/api/availability", lecturerToken, {
        method: "POST",
        body: { dayOfWeek: "saturday", startTime: "07:00", endTime: "08:00", duration: 30 },
      }),
    );
    expect(created.status).toBe(201);
    const denied = await createAvailability(
      stub("http://x/api/availability", studentToken, {
        method: "POST",
        body: { dayOfWeek: "saturday", startTime: "07:00", endTime: "08:00", duration: 30 },
      }),
    );
    expect(denied.status).toBe(403);
  });

  it("admin reads directory, reports, and students", async () => {
    expect((await adminReports(stub("http://x/api/admin/reports", adminToken))).status).toBe(200);
    const students = await adminStudents(stub("http://x/api/admin/students", adminToken));
    expect(students.status).toBe(200);
    const body = (await students.json()) as { students: unknown[] };
    expect(body.students.length).toBeGreaterThan(0);
  });

  it("no endpoint leaks secrets or SQL", async () => {
    const res = await bookAppointment(
      stub("http://x/api/appointments", studentToken, {
        method: "POST",
        body: { lecturerId: "not-a-uuid" },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toMatch(/select|postgres|stack|constraint/i);
  });

  it("client-supplied ownership is ignored (server derives identity)", async () => {
    // A student passes another student's id: the server books for the
    // caller, never for the supplied id.
    const other = await bookAppointment(
      stub("http://x/api/appointments", studentToken, {
        method: "POST",
        body: {
          studentId: "00000000-0000-0000-0000-000000000000",
          lecturerId: fx.lecturerActor.lecturerId,
          courseId: fx.courseId,
          date: futureDate(32),
          startTime: "10:00",
          endTime: "10:30",
          type: "in-person",
          reason: "Ownership must come from session",
        },
      }),
    );
    expect(other.status).toBe(201);
    const mine = await listAppointments(stub("http://x/api/appointments", studentToken));
    const mineBody = (await mine.json()) as { appointments: { id: string }[] };
    const created = (await other.json()) as { appointment: { id: string } };
    expect(mineBody.appointments.map((a) => a.id)).toContain(created.appointment.id);
  });
});
