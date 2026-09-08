/**
 * Phase-4 verification of the slot-generation algorithm (§20).
 *
 * A fixed `now` (2026-09-08 08:00 institution time = 05:00Z, since EAT is
 * UTC+3) keeps every case deterministic. Dates are chosen so weekdays line up:
 *   2026-09-07 = Monday, 2026-09-08 = Tuesday, 2026-09-14 = Monday.
 */
import { describe, expect, it } from "vitest";
import {
  bookableSlots,
  findOverlappingWindow,
  generateSlotsForDate,
  validateWindow,
} from "@/lib/scheduling/slots";
import { CONSULTATION_DURATION_MINUTES } from "@/lib/scheduling/config";

const NOW = new Date("2026-09-08T05:00:00Z"); // Tuesday 08:00 EAT
const MONDAY = "2026-09-14"; // a future Monday
const TUESDAY = "2026-09-08"; // "today"

function available(date: string, start: string, end: string) {
  return { date, startTime: start, endTime: end, status: "available" as const };
}

describe("basic generation", () => {
  it("09:00 → 12:00 at 30 min yields 6 slots", () => {
    const slots = generateSlotsForDate({
      date: MONDAY,
      windows: [{ startTime: "09:00", endTime: "12:00" }],
      durationMinutes: 30,
      now: NOW,
    });
    expect(slots).toHaveLength(6);
    expect(slots[0]).toEqual(available(MONDAY, "09:00", "09:30"));
    expect(slots[5]).toEqual(available(MONDAY, "11:30", "12:00"));
    expect(bookableSlots(slots)).toHaveLength(6);
  });

  it("uses the configured default duration (30)", () => {
    expect(CONSULTATION_DURATION_MINUTES).toBe(30);
    const slots = generateSlotsForDate({
      date: MONDAY,
      windows: [{ startTime: "09:00", endTime: "10:00" }],
      now: NOW,
    });
    expect(slots.map((s) => `${s.startTime}-${s.endTime}`)).toEqual([
      "09:00-09:30",
      "09:30-10:00",
    ]);
  });
});

describe("boundaries", () => {
  it("09:00 → 10:00 yields exactly 09:00-09:30 and 09:30-10:00", () => {
    const slots = generateSlotsForDate({
      date: MONDAY,
      windows: [{ startTime: "09:00", endTime: "10:00" }],
      durationMinutes: 30,
      now: NOW,
    });
    expect(slots.map((s) => `${s.startTime}-${s.endTime}`)).toEqual([
      "09:00-09:30",
      "09:30-10:00",
    ]);
  });

  it("never lets a slot extend beyond the window (45-min in 60-min window)", () => {
    const slots = generateSlotsForDate({
      date: MONDAY,
      windows: [{ startTime: "09:00", endTime: "10:00" }],
      durationMinutes: 45,
      now: NOW,
    });
    expect(slots.map((s) => `${s.startTime}-${s.endTime}`)).toEqual([
      "09:00-09:45",
    ]);
  });
});

describe("multiple ranges", () => {
  it("09:00-10:00 plus 13:00-15:00 yields 2 + 4 slots, gap untouched", () => {
    const slots = generateSlotsForDate({
      date: MONDAY,
      windows: [
        { startTime: "09:00", endTime: "10:00" },
        { startTime: "13:00", endTime: "15:00" },
      ],
      durationMinutes: 30,
      now: NOW,
    });
    expect(slots).toHaveLength(6);
    expect(slots.every((s) => s.status === "available")).toBe(true);
    expect(slots.some((s) => s.startTime >= "10:00" && s.startTime < "13:00")).toBe(
      false,
    );
  });
});

describe("appointment conflicts", () => {
  it("approved 10:00-10:30 blocks that slot only", () => {
    const slots = generateSlotsForDate({
      date: MONDAY,
      windows: [{ startTime: "09:00", endTime: "12:00" }],
      durationMinutes: 30,
      appointments: [{ startTime: "10:00", endTime: "10:30", status: "approved" }],
      now: NOW,
    });
    const target = slots.find((s) => s.startTime === "10:00");
    expect(target?.status).toBe("booked");
    expect(bookableSlots(slots)).toHaveLength(5);
  });

  it("pending maps to pending; cancelled/rejected never block", () => {
    const slots = generateSlotsForDate({
      date: MONDAY,
      windows: [{ startTime: "09:00", endTime: "10:00" }],
      durationMinutes: 30,
      appointments: [
        { startTime: "09:00", endTime: "09:30", status: "pending" },
        { startTime: "09:30", endTime: "10:00", status: "cancelled" },
      ],
      now: NOW,
    });
    expect(slots[0].status).toBe("pending");
    // cancelled is filtered as non-blocking → stays available
    expect(slots[1].status).toBe("available");
  });

  it("partial appointment overlap blocks the touched slots", () => {
    const slots = generateSlotsForDate({
      date: MONDAY,
      windows: [{ startTime: "09:00", endTime: "11:00" }],
      durationMinutes: 30,
      appointments: [{ startTime: "09:45", endTime: "10:15", status: "approved" }],
      now: NOW,
    });
    const byStart = new Map(slots.map((s) => [s.startTime, s.status]));
    expect(byStart.get("09:30")).toBe("booked");
    expect(byStart.get("10:00")).toBe("booked");
    expect(byStart.get("09:00")).toBe("available");
    expect(byStart.get("10:30")).toBe("available");
  });
});

describe("exceptions", () => {
  it("full-day exception yields zero slots", () => {
    const slots = generateSlotsForDate({
      date: MONDAY,
      windows: [{ startTime: "09:00", endTime: "12:00" }],
      durationMinutes: 30,
      exceptions: [
        { startDatetime: `${MONDAY}T00:00:00+03:00`, endDatetime: `${MONDAY}T23:59:00+03:00` },
      ],
      now: NOW,
    });
    expect(slots).toHaveLength(0);
  });

  it("partial exception carves out only its span", () => {
    const slots = generateSlotsForDate({
      date: MONDAY,
      windows: [{ startTime: "09:00", endTime: "12:00" }],
      durationMinutes: 30,
      exceptions: [
        { startDatetime: `${MONDAY}T10:00:00+03:00`, endDatetime: `${MONDAY}T11:00:00+03:00` },
      ],
      now: NOW,
    });
    const byStart = new Map(slots.map((s) => [s.startTime, s.status]));
    expect(slots).toHaveLength(6);
    expect(byStart.get("09:00")).toBe("available");
    expect(byStart.get("09:30")).toBe("available");
    expect(byStart.get("10:00")).toBe("unavailable");
    expect(byStart.get("10:30")).toBe("unavailable");
    expect(byStart.get("11:00")).toBe("available");
    expect(byStart.get("11:30")).toBe("available");
  });

  it("multi-day exception blocks covered dates, spares the rest", () => {
    const ex = [
      {
        startDatetime: "2026-09-13T12:00:00+03:00",
        endDatetime: "2026-09-15T12:00:00+03:00",
      },
    ];
    const mk = (date: string) =>
      generateSlotsForDate({
        date,
        windows: [{ startTime: "09:00", endTime: "10:00" }],
        durationMinutes: 30,
        exceptions: ex,
        now: NOW,
      });
    // Sep 13 morning is before the exception starts → available.
    expect(mk("2026-09-13").map((s) => s.status)).toEqual([
      "available",
      "available",
    ]);
    // Sep 14 fully covered → no slots at all.
    expect(mk("2026-09-14")).toHaveLength(0);
    // Sep 15 morning covered until 12:00 → 09:00-10:00 unavailable.
    expect(mk("2026-09-15").map((s) => s.status)).toEqual([
      "unavailable",
      "unavailable",
    ]);
  });

  it("breaks carve out sub-ranges", () => {
    const slots = generateSlotsForDate({
      date: MONDAY,
      windows: [{ startTime: "09:00", endTime: "12:00" }],
      durationMinutes: 30,
      breaks: [{ startTime: "10:30", endTime: "10:45" }],
      now: NOW,
    });
    const byStart = new Map(slots.map((s) => [s.startTime, s.status]));
    expect(byStart.get("10:30")).toBe("unavailable");
    expect(byStart.get("09:00")).toBe("available");
  });
});

describe("past slots and notice", () => {
  it("past dates yield only past slots", () => {
    const slots = generateSlotsForDate({
      date: "2026-09-01",
      windows: [{ startTime: "09:00", endTime: "10:00" }],
      durationMinutes: 30,
      now: NOW,
    });
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => s.status === "past")).toBe(true);
    expect(bookableSlots(slots)).toHaveLength(0);
  });

  it("today: elapsed slots are past, upcoming stay available", () => {
    const slots = generateSlotsForDate({
      date: TUESDAY,
      windows: [{ startTime: "07:00", endTime: "09:00" }],
      durationMinutes: 30,
      now: NOW, // 08:00
    });
    const byStart = new Map(slots.map((s) => [s.startTime, s.status]));
    expect(byStart.get("07:00")).toBe("past");
    expect(byStart.get("07:30")).toBe("past");
    expect(byStart.get("08:00")).toBe("available");
    expect(byStart.get("08:30")).toBe("available");
  });

  it("minimum notice makes imminent slots unavailable", () => {
    const slots = generateSlotsForDate({
      date: TUESDAY,
      windows: [{ startTime: "08:00", endTime: "10:00" }],
      durationMinutes: 30,
      minNoticeMinutes: 120,
      now: NOW, // 08:00 → nothing before 10:00 is bookable
    });
    expect(slots.every((s) => s.status === "unavailable")).toBe(true);
  });
});

describe("validation and overlap", () => {
  it("rejects 09:00 → 08:00 and 14:00 → 14:00", () => {
    expect(() =>
      generateSlotsForDate({
        date: MONDAY,
        windows: [{ startTime: "09:00", endTime: "08:00" }],
        now: NOW,
      }),
    ).toThrow("End time must be after start time.");
    expect(() => validateWindow({ startTime: "14:00", endTime: "14:00" })).toThrow(
      "End time must be after start time.",
    );
  });

  it("detects contained and partial overlaps, allows adjacency", () => {
    const existing = [{ startTime: "09:00", endTime: "12:00" }];
    expect(
      findOverlappingWindow(existing, { startTime: "11:00", endTime: "14:00" }),
    ).toEqual(existing[0]);
    expect(
      findOverlappingWindow(existing, { startTime: "09:30", endTime: "10:30" }),
    ).toEqual(existing[0]);
    expect(
      findOverlappingWindow(existing, { startTime: "12:00", endTime: "13:00" }),
    ).toBeNull();
    expect(
      findOverlappingWindow(existing, { startTime: "08:00", endTime: "09:00" }),
    ).toBeNull();
  });

  it("excludeIndex skips the row being edited", () => {
    const existing = [
      { startTime: "09:00", endTime: "12:00" },
      { startTime: "13:00", endTime: "15:00" },
    ];
    expect(
      findOverlappingWindow(existing, { startTime: "09:00", endTime: "12:00" }, 0),
    ).toBeNull();
  });

  it("rejects non-positive durations", () => {
    expect(() =>
      generateSlotsForDate({
        date: MONDAY,
        windows: [{ startTime: "09:00", endTime: "10:00" }],
        durationMinutes: 0,
        now: NOW,
      }),
    ).toThrow("positive");
  });
});
