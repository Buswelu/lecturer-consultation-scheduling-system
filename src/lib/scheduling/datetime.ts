/**
 * LCSS timezone-safe date/time utilities (Phase 4).
 *
 * Golden rule: recurring availability and slot math NEVER go through
 * `new Date("YYYY-MM-DD")` (parsed as UTC midnight → off-by-one in
 * negative-offset zones) and never mix UTC timestamps with wall-clock
 * times. Wall-clock arithmetic uses plain minutes + YMD strings; conversion
 * to absolute time goes through `zonedWallToUtcMs`, which is DST-safe.
 */
import { INSTITUTION_TIMEZONE } from "./config";
import type { DayOfWeek } from "@/lib/types";

const TIME_RE = /^(\d{2}):(\d{2})$/;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "HH:MM" → minutes since midnight. Throws on invalid input. */
export function timeToMinutes(time: string): number {
  const m = TIME_RE.exec(time);
  if (!m) throw new Error(`Invalid time "${time}". Expected HH:MM.`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Invalid time "${time}".`);
  return h * 60 + min;
}

/** Minutes since midnight → "HH:MM" (wraps past 24h defensively). */
export function minutesToTime(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** "YYYY-MM-DD" → { y, m, d }. Throws on invalid input. */
export function parseYMD(ymd: string): { y: number; m: number; d: number } {
  const m = YMD_RE.exec(ymd);
  if (!m) throw new Error(`Invalid date "${ymd}". Expected YYYY-MM-DD.`);
  const y = Number(m[1]);
  const month = Number(m[2]);
  const d = Number(m[3]);
  if (month < 1 || month > 12 || d < 1 || d > 31) {
    throw new Error(`Invalid date "${ymd}".`);
  }
  return { y, m: month, d };
}

/** { y, m, d } → "YYYY-MM-DD". */
export function toYMD(y: number, m: number, d: number): string {
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d
    .toString()
    .padStart(2, "0")}`;
}

/** Add (or subtract) whole days to a YMD — pure UTC arithmetic, DST-proof. */
export function addDaysYMD(ymd: string, days: number): string {
  const { y, m, d } = parseYMD(ymd);
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return toYMD(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Compare two YMD strings: -1 | 0 | 1. */
export function compareYMD(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

const DAY_NAMES: DayOfWeek[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Domain day name → 0 (Sunday) … 6 (Saturday). */
export function dayNameToIndex(day: DayOfWeek): number {
  const idx = DAY_NAMES.indexOf(day);
  if (idx < 0) throw new Error(`Invalid day of week "${day}".`);
  return idx;
}

/** 0 (Sunday) … 6 (Saturday) → domain day name. */
export function dayIndexToName(index: number): DayOfWeek {
  const day = DAY_NAMES[((index % 7) + 7) % 7];
  return day;
}

/**
 * Weekday index (0=Sunday) of a wall-clock date in the given timezone.
 * Uses noon UTC internally so zone offsets can't shift the day.
 */
export function weekdayIndexYMD(ymd: string, timeZone = INSTITUTION_TIMEZONE): number {
  const { y, m, d } = parseYMD(ymd);
  const sundayBased = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const idx = map[sundayBased];
  if (idx === undefined) throw new Error(`Could not resolve weekday for "${ymd}".`);
  return idx;
}

/** Offset of `timeZone` at an instant, in milliseconds (DST-aware). */
function tzOffsetMs(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Missing ${type} part for timezone "${timeZone}".`);
    return Number(part.value);
  };
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUTC - instant.getTime();
}

/**
 * Wall-clock date + minutes-since-midnight in `timeZone` → epoch millis.
 * Two-pass offset resolution keeps it correct across DST transitions.
 */
export function zonedWallToUtcMs(
  ymd: string,
  minutes: number,
  timeZone = INSTITUTION_TIMEZONE,
): number {
  const { y, m, d } = parseYMD(ymd);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0) + Math.round(minutes) * 60_000;
  const offset1 = tzOffsetMs(timeZone, new Date(guess));
  const offset2 = tzOffsetMs(timeZone, new Date(guess - offset1));
  return guess - offset2;
}

/** Wall-clock date + "HH:MM" in `timeZone` → ISO UTC string (for DB writes). */
export function wallToISO(
  ymd: string,
  time: string,
  timeZone = INSTITUTION_TIMEZONE,
): string {
  return new Date(zonedWallToUtcMs(ymd, timeToMinutes(time), timeZone)).toISOString();
}

/** Today's wall-clock date (YYYY-MM-DD) in the institution timezone. */
export function todayYMD(
  now: Date = new Date(),
  timeZone = INSTITUTION_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Missing ${type} part.`);
    return part.value;
  };
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Format an ISO instant as a wall date in the institution timezone. */
export function formatDateInTZ(
  iso: string,
  timeZone = INSTITUTION_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** Format an ISO instant as wall-clock "HH:MM" in the institution timezone. */
export function formatTimeInTZ(
  iso: string,
  timeZone = INSTITUTION_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Split an ISO timestamptz into institution wall-clock date + HH:mm.
 * Replaces naive UTC splitting (which shifts wall times in UTC+3).
 */
export function splitDatetimeInTZ(
  iso: string,
  timeZone = INSTITUTION_TIMEZONE,
): { date: string; time: string } {
  const d = new Date(iso);
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string): string => {
    const part = dateParts.find((p) => p.type === type);
    if (!part) throw new Error(`Missing ${type} part.`);
    return part.value;
  };
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: formatTimeInTZ(iso, timeZone),
  };
}

/** True for canonical UUID strings (guards live UUID-column queries). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Validate a [start, end) HH:MM range. Throws user-friendly errors consumed
 * by forms and the service layer (DB CHECK remains authoritative).
 */
export function assertValidTimeRange(startTime: string, endTime: string): void {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start >= end) {
    throw new Error("End time must be after start time.");
  }
}
