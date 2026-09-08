/** Unit tests for timezone-safe datetime utilities. */
import { describe, expect, it } from "vitest";
import {
  addDaysYMD,
  assertValidTimeRange,
  compareYMD,
  dayIndexToName,
  dayNameToIndex,
  isUuid,
  minutesToTime,
  parseYMD,
  timeToMinutes,
  toYMD,
  weekdayIndexYMD,
  zonedWallToUtcMs,
} from "@/lib/scheduling/datetime";
import { INSTITUTION_TIMEZONE } from "@/lib/scheduling/config";

describe("time conversion", () => {
  it("round-trips HH:MM", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:59")).toBe(1439);
    expect(minutesToTime(570)).toBe("09:30");
    expect(minutesToTime(0)).toBe("00:00");
  });

  it("rejects malformed times", () => {
    expect(() => timeToMinutes("9:00")).toThrow();
    expect(() => timeToMinutes("24:00")).toThrow();
    expect(() => timeToMinutes("ab:cd")).toThrow();
  });
});

describe("YMD handling", () => {
  it("parses and formats without Date-shift bugs", () => {
    expect(parseYMD("2026-09-08")).toEqual({ y: 2026, m: 9, d: 8 });
    expect(toYMD(2026, 1, 5)).toBe("2026-01-05");
    expect(() => parseYMD("2026-13-01")).toThrow();
    expect(() => parseYMD("09/08/2026")).toThrow();
  });

  it("adds days across month boundaries", () => {
    expect(addDaysYMD("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysYMD("2026-09-08", -8)).toBe("2026-08-31");
    expect(addDaysYMD("2024-02-28", 1)).toBe("2024-02-29"); // leap year
  });

  it("compares lexicographically-safe dates", () => {
    expect(compareYMD("2026-09-08", "2026-09-14")).toBe(-1);
    expect(compareYMD("2026-09-14", "2026-09-14")).toBe(0);
    expect(compareYMD("2026-10-01", "2026-09-30")).toBe(1);
  });
});

describe("weekdays", () => {
  it("maps names to Sunday-based indexes", () => {
    expect(dayNameToIndex("sunday")).toBe(0);
    expect(dayNameToIndex("monday")).toBe(1);
    expect(dayNameToIndex("saturday")).toBe(6);
    expect(dayIndexToName(0)).toBe("sunday");
    expect(dayIndexToName(6)).toBe("saturday");
  });

  it("resolves known calendar dates (institution zone)", () => {
    expect(INSTITUTION_TIMEZONE).toBe("Africa/Dar_es_Salaam");
    expect(weekdayIndexYMD("2026-09-07")).toBe(1); // Monday
    expect(weekdayIndexYMD("2026-09-08")).toBe(2); // Tuesday
    expect(weekdayIndexYMD("2026-09-13")).toBe(0); // Sunday
  });
});

describe("zoned conversion", () => {
  it("maps institution wall-clock to UTC (Dar es Salaam is UTC+3)", () => {
    expect(zonedWallToUtcMs("2026-09-08", 540)).toBe(Date.UTC(2026, 8, 8, 6, 0));
    expect(zonedWallToUtcMs("2026-09-08", 0)).toBe(Date.UTC(2026, 8, 7, 21, 0));
  });
});

describe("validation helpers", () => {
  it("assertValidTimeRange enforces start < end", () => {
    expect(() => assertValidTimeRange("09:00", "12:00")).not.toThrow();
    expect(() => assertValidTimeRange("09:00", "08:00")).toThrow(
      "End time must be after start time.",
    );
    expect(() => assertValidTimeRange("14:00", "14:00")).toThrow(
      "End time must be after start time.",
    );
  });

  it("isUuid accepts canonical UUIDs only", () => {
    expect(isUuid("123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isUuid("lec-1")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
