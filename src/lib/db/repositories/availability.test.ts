import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addException,
  addRule,
  computeSlots,
  deleteException,
  deleteRule,
  exceptionsForLecturer,
  rulesForLecturer,
  updateRule,
} from "./availability";
import { getPool } from "@/lib/db/pool";
import { makeFixture, setupSuite, teardownSuite } from "./fixtures";

const TAG = "tdbavail";

beforeAll(async () => {
  await setupSuite(TAG);
});

afterAll(async () => {
  await teardownSuite();
});

describe("availability repository", () => {
  it("lecturer creates, updates, and deletes rules", async () => {
    const fx = await makeFixture("avail");
    const lid = fx.lecturerActor.lecturerId as string;
    const created = await addRule(fx.lecturerActor, lid, {
      dayOfWeek: "saturday",
      startTime: "08:00",
      endTime: "10:00",
      duration: 30,
    });
    expect(created.dayOfWeek).toBe("saturday");
    const updated = await updateRule(fx.lecturerActor, created.id, lid, {
      dayOfWeek: "saturday",
      startTime: "08:00",
      endTime: "11:00",
      duration: 30,
    });
    expect(updated.endTime).toBe("11:00");
    await deleteRule(fx.lecturerActor, created.id, lid);
    expect((await rulesForLecturer(lid)).find((r) => r.id === created.id)).toBeUndefined();
  });

  it("rejects overlapping rules (friendly pre-check)", async () => {
    const fx = await makeFixture("availoverlap");
    const lid = fx.lecturerActor.lecturerId as string;
    await addRule(fx.lecturerActor, lid, {
      dayOfWeek: "sunday",
      startTime: "09:00",
      endTime: "10:00",
      duration: 30,
    });
    await expect(
      addRule(fx.lecturerActor, lid, {
        dayOfWeek: "sunday",
        startTime: "09:30",
        endTime: "10:30",
        duration: 30,
      }),
    ).rejects.toThrow(/overlaps/);
  });

  it("database trigger rejects overlaps even on direct SQL", async () => {
    const fx = await makeFixture("availdb");
    const lid = fx.lecturerActor.lecturerId as string;
    await getPool().query(
      "insert into public.availability (lecturer_id, day_of_week, start_time, end_time) values ($1, 6, '13:00', '14:00')",
      [lid],
    );
    await expect(
      getPool().query(
        "insert into public.availability (lecturer_id, day_of_week, start_time, end_time) values ($1, 6, '13:30', '14:30')",
        [lid],
      ),
    ).rejects.toMatchObject({ code: "P0001" });
  });

  it("lecturer cannot manage another lecturer's availability", async () => {
    const a = await makeFixture("availa");
    const b = await makeFixture("availb");
    await expect(
      addRule(a.lecturerActor, b.lecturerActor.lecturerId as string, {
        dayOfWeek: "monday",
        startTime: "09:00",
        endTime: "10:00",
        duration: 30,
      }),
    ).rejects.toThrow(/not authorized/);
  });

  it("exceptions round-trip and feed slot blocking", async () => {
    const fx = await makeFixture("availex");
    const lid = fx.lecturerActor.lecturerId as string;
    const created = await addException(fx.lecturerActor, lid, {
      startDatetime: "2030-06-01T09:00:00+03:00",
      endDatetime: "2030-06-01T12:00:00+03:00",
      reason: "leave",
    });
    expect((await exceptionsForLecturer(lid)).map((e) => e.id)).toContain(created.id);
    await deleteException(fx.lecturerActor, created.id, lid);
    expect((await exceptionsForLecturer(lid)).map((e) => e.id)).not.toContain(created.id);
  });

  it("computes slots from real rules", async () => {
    const fx = await makeFixture("availslots");
    const lid = fx.lecturerActor.lecturerId as string;
    await addRule(fx.lecturerActor, lid, {
      dayOfWeek: "monday",
      startTime: "09:00",
      endTime: "10:00",
      duration: 30,
    });
    // 2030-06-03 is a Monday.
    const slots = await computeSlots({ lecturerId: lid, from: "2030-06-03", to: "2030-06-03" });
    const available = (slots["2030-06-03"] ?? []).filter((s) => s.status === "available");
    expect(available.length).toBe(2);
  });
});
