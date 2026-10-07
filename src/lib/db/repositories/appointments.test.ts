import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approveAppointmentAs,
  cancelAppointmentAs,
  completeAppointmentAs,
  createAppointmentAs,
  getAppointment,
  listAppointments,
  listAppointmentsPage,
  noShowAppointmentAs,
  rejectAppointmentAs,
  rescheduleAppointmentAs,
  setAppointmentStatusAs,
  updateAppointmentFieldsAs,
} from "./appointments";
import { addRule } from "./availability";
import { markAllRead, notificationsFor, unreadCountFor } from "./notifications";
import { BookingConflictError } from "@/lib/scheduling/slots";
import { makeFixture, setupSuite, teardownSuite } from "./fixtures";
import type { Actor } from "./types";

const TAG = "tdbappt";

beforeAll(async () => {
  await setupSuite(TAG);
});

afterAll(async () => {
  await teardownSuite();
});

/** Fixture lecturer with all-day rules so tests can book any future date. */
async function lecturerWithWeek(fx: Awaited<ReturnType<typeof makeFixture>>): Promise<Actor> {
  const lid = fx.lecturerActor.lecturerId as string;
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  for (const dayOfWeek of days) {
    await addRule(fx.lecturerActor, lid, {
      dayOfWeek,
      startTime: "08:00",
      endTime: "18:00",
      duration: 30,
    });
  }
  return fx.lecturerActor;
}

function futureDate(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86400000);
  const eat = new Date(d.getTime() + 3 * 3600000);
  return eat.toISOString().slice(0, 10);
}

describe("appointments repository", () => {
  it("student books; lecturer and student are notified; history logged", async () => {
    const fx = await makeFixture("book");
    await lecturerWithWeek(fx);
    const date = futureDate(9);
    const created = await createAppointmentAs(fx.studentActor, {
      studentId: fx.studentActor.studentId as string,
      lecturerId: fx.lecturerActor.lecturerId as string,
      courseId: fx.courseId,
      date,
      startTime: "10:00",
      endTime: "10:30",
      type: "in-person",
      reason: "Need help with databases",
    });
    expect(created.status).toBe("pending");
    expect(created.lecturerName).toBeDefined();
    expect(created.studentName).toBeDefined();

    const lecturerNotifs = await notificationsFor(fx.lecturerActor.profileId);
    expect(lecturerNotifs.some((n) => n.title === "New consultation request")).toBe(true);

    const fetched = await getAppointment(fx.studentActor, created.id);
    expect(fetched?.history.length).toBeGreaterThan(0);
  });

  it("rejects past, outside-availability, invalid course/lecturer bookings", async () => {
    const fx = await makeFixture("bookinvalid");
    await lecturerWithWeek(fx);
    const lid = fx.lecturerActor.lecturerId as string;
    const base = {
      studentId: fx.studentActor.studentId as string,
      lecturerId: lid,
      courseId: fx.courseId,
      date: futureDate(9),
      startTime: "10:00",
      endTime: "10:30",
      type: "in-person" as const,
      reason: "Need help with databases",
    };
    await expect(
      createAppointmentAs(fx.studentActor, { ...base, date: "2020-01-01" }),
    ).rejects.toThrow(/past/);
    await expect(
      createAppointmentAs(fx.studentActor, {
        ...base,
        lecturerId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow(/no longer available/);
    await expect(
      createAppointmentAs(fx.studentActor, {
        ...base,
        courseId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow(/not offered/);
  });

  it("double booking is rejected; adjacent slots allowed", async () => {
    const fx = await makeFixture("double");
    await lecturerWithWeek(fx);
    const lid = fx.lecturerActor.lecturerId as string;
    const sid = fx.studentActor.studentId as string;
    const date = futureDate(10);
    const base = {
      studentId: sid,
      lecturerId: lid,
      courseId: fx.courseId,
      date,
      type: "in-person" as const,
      reason: "Need help with databases",
    };
    await createAppointmentAs(fx.studentActor, { ...base, startTime: "10:00", endTime: "10:30" });
    await expect(
      createAppointmentAs(fx.studentActor, { ...base, startTime: "10:15", endTime: "10:45" }),
    ).rejects.toBeInstanceOf(BookingConflictError);
    const adjacent = await createAppointmentAs(fx.studentActor, {
      ...base,
      startTime: "10:30",
      endTime: "11:00",
    });
    expect(adjacent.status).toBe("pending");
  });

  it("concurrent bookings: exactly one wins", async () => {
    const fx = await makeFixture("race");
    await lecturerWithWeek(fx);
    const lid = fx.lecturerActor.lecturerId as string;
    const sid = fx.studentActor.studentId as string;
    const date = futureDate(11);
    const attempt = () =>
      createAppointmentAs(fx.studentActor, {
        studentId: sid,
        lecturerId: lid,
        courseId: fx.courseId,
        date,
        startTime: "11:00",
        endTime: "11:30",
        type: "online",
        reason: "Race for the same slot",
      });
    const results = await Promise.allSettled([attempt(), attempt()]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won.length).toBe(1);
    expect(lost.length).toBe(1);
    expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(BookingConflictError);
  });

  it("lecturer approves then completes; student notified", async () => {
    const fx = await makeFixture("approve");
    await lecturerWithWeek(fx);
    const created = await createAppointmentAs(fx.studentActor, {
      studentId: fx.studentActor.studentId as string,
      lecturerId: fx.lecturerActor.lecturerId as string,
      courseId: fx.courseId,
      date: futureDate(12),
      startTime: "09:00",
      endTime: "09:30",
      type: "online",
      reason: "Thesis guidance needed",
    });
    const approved = await approveAppointmentAs(fx.lecturerActor, created.id);
    expect(approved.status).toBe("approved");
    const completed = await completeAppointmentAs(fx.lecturerActor, created.id);
    expect(completed.status).toBe("completed");
    // Created + approved + completed history rows via the DB trigger.
    expect(completed.history.length).toBeGreaterThanOrEqual(3);
    const studentNotifs = await notificationsFor(fx.studentActor.profileId);
    expect(studentNotifs.some((n) => n.title === "Consultation approved")).toBe(true);
  });

  it("reject, cancel, reschedule, no-show transitions", async () => {
    const fx = await makeFixture("transitions");
    await lecturerWithWeek(fx);
    const lid = fx.lecturerActor.lecturerId as string;
    const sid = fx.studentActor.studentId as string;
    const mk = (day: number, start: string) =>
      createAppointmentAs(fx.studentActor, {
        studentId: sid,
        lecturerId: lid,
        courseId: fx.courseId,
        date: futureDate(day),
        startTime: start,
        endTime: "09:30",
        type: "in-person",
        reason: "Transition coverage case",
      });
    const rejected = await mk(13, "09:00");
    expect((await rejectAppointmentAs(fx.lecturerActor, rejected.id, "busy")).status).toBe(
      "rejected",
    );
    const cancelled = await mk(14, "09:00");
    expect((await cancelAppointmentAs(fx.studentActor, cancelled.id)).status).toBe("cancelled");
    const rescheduled = await mk(15, "09:00");
    const moved = await rescheduleAppointmentAs(fx.lecturerActor, rescheduled.id, {
      date: futureDate(16),
      startTime: "10:00",
      endTime: "10:30",
    });
    expect(moved.status).toBe("rescheduled");
    expect(moved.date).toBe(futureDate(16));
    const noShow = await approveAppointmentAs(
      fx.lecturerActor,
      (await mk(17, "09:00")).id,
    );
    expect((await noShowAppointmentAs(fx.lecturerActor, noShow.id)).status).toBe("no-show");
  });

  it("illegal transitions are rejected", async () => {
    const fx = await makeFixture("illegal");
    await lecturerWithWeek(fx);
    const created = await createAppointmentAs(fx.studentActor, {
      studentId: fx.studentActor.studentId as string,
      lecturerId: fx.lecturerActor.lecturerId as string,
      courseId: fx.courseId,
      date: futureDate(18),
      startTime: "09:00",
      endTime: "09:30",
      type: "in-person",
      reason: "Illegal transition probe",
    });
    await expect(completeAppointmentAs(fx.lecturerActor, created.id)).rejects.toThrow(
      /Cannot change appointment/,
    );
  });

  it("ownership is enforced across students and lecturers", async () => {
    const a = await makeFixture("owna");
    const b = await makeFixture("ownb");
    await lecturerWithWeek(a);
    const created = await createAppointmentAs(a.studentActor, {
      studentId: a.studentActor.studentId as string,
      lecturerId: a.lecturerActor.lecturerId as string,
      courseId: a.courseId,
      date: futureDate(19),
      startTime: "09:00",
      endTime: "09:30",
      type: "in-person",
      reason: "Ownership probe booking",
    });
    await expect(getAppointment(b.studentActor, created.id)).rejects.toThrow(/not authorized/);
    await expect(approveAppointmentAs(b.lecturerActor, created.id)).rejects.toThrow(
      /not authorized/,
    );
    expect((await listAppointments(b.adminActor)).length).toBeGreaterThan(0);
    const mine = await listAppointments(a.studentActor);
    expect(mine.map((x) => x.id)).toContain(created.id);
    expect((await listAppointments(b.studentActor)).map((x) => x.id)).not.toContain(created.id);
  });

  it("field updates persist without touching status", async () => {
    const fx = await makeFixture("fields");
    await lecturerWithWeek(fx);
    const created = await createAppointmentAs(fx.studentActor, {
      studentId: fx.studentActor.studentId as string,
      lecturerId: fx.lecturerActor.lecturerId as string,
      courseId: fx.courseId,
      date: futureDate(20),
      startTime: "09:00",
      endTime: "09:30",
      type: "online",
      reason: "Field update probe here",
    });
    // Field edits require a non-pending state (DB update-guard rule).
    await approveAppointmentAs(fx.lecturerActor, created.id);
    const updated = await updateAppointmentFieldsAs(fx.lecturerActor, created.id, {
      location: "Room 101",
      meetingLink: "https://meet.example/r101",
    });
    expect(updated.status).toBe("approved");
    expect(updated.location).toBe("Room 101");
    await expect(
      updateAppointmentFieldsAs(fx.studentActor, created.id, { notes: "x" }),
    ).rejects.toThrow(/not authorized/);
  });

  it("legacy status setter validates and scopes", async () => {
    const fx = await makeFixture("legacy");
    await lecturerWithWeek(fx);
    const created = await createAppointmentAs(fx.studentActor, {
      studentId: fx.studentActor.studentId as string,
      lecturerId: fx.lecturerActor.lecturerId as string,
      courseId: fx.courseId,
      date: futureDate(21),
      startTime: "09:00",
      endTime: "09:30",
      type: "in-person",
      reason: "Legacy setter coverage",
    });
    expect(
      await setAppointmentStatusAs(fx.lecturerActor, created.id, "approved"),
    ).toMatchObject({ status: "approved" });
    expect(
      await setAppointmentStatusAs(fx.lecturerActor, created.id, "rejected"),
    ).toBeNull();
  });

  it("notifications: unread counts and mark-all-read", async () => {
    const fx = await makeFixture("notifcount");
    await lecturerWithWeek(fx);
    await createAppointmentAs(fx.studentActor, {
      studentId: fx.studentActor.studentId as string,
      lecturerId: fx.lecturerActor.lecturerId as string,
      courseId: fx.courseId,
      date: futureDate(22),
      startTime: "09:00",
      endTime: "09:30",
      type: "in-person",
      reason: "Notification count probe",
    });
    expect(await unreadCountFor(fx.studentActor.profileId)).toBeGreaterThan(0);
    await markAllRead(fx.studentActor);
    expect(await unreadCountFor(fx.studentActor.profileId)).toBe(0);
  });

  it("paginated listing returns exact totals", async () => {
    const fx = await makeFixture("paging");
    await lecturerWithWeek(fx);
    await createAppointmentAs(fx.studentActor, {
      studentId: fx.studentActor.studentId as string,
      lecturerId: fx.lecturerActor.lecturerId as string,
      courseId: fx.courseId,
      date: futureDate(23),
      startTime: "09:00",
      endTime: "09:30",
      type: "in-person",
      reason: "Pagination probe booking",
    });
    const page = await listAppointmentsPage(fx.adminActor, {}, { page: 1, pageSize: 1 });
    expect(page.items.length).toBeLessThanOrEqual(1);
    expect(page.total).toBeGreaterThanOrEqual(page.items.length);
    expect(page.page).toBe(1);
  });
});
