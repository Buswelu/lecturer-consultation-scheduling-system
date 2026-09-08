/** Phase-5 unit tests: status transitions, validation, error mapping. */
import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_TRANSITIONS,
  assertTransitionAllowed,
  toFriendlyBookingError,
  BookingConflictError,
} from "@/lib/services/appointments";
import type { AppointmentStatus } from "@/lib/types";

describe("APPOINTMENT_TRANSITIONS", () => {
  it("pending can go to approved/rejected/cancelled/rescheduled", () => {
    expect(APPOINTMENT_TRANSITIONS.pending).toEqual(
      expect.arrayContaining(["approved", "rejected", "cancelled", "rescheduled"]),
    );
    expect(APPOINTMENT_TRANSITIONS.pending).not.toContain("completed");
    expect(APPOINTMENT_TRANSITIONS.pending).not.toContain("no-show");
    expect(APPOINTMENT_TRANSITIONS.pending).not.toContain("pending");
  });

  it("approved can go to completed/cancelled/rescheduled/no-show", () => {
    expect(APPOINTMENT_TRANSITIONS.approved).toEqual(
      expect.arrayContaining(["completed", "cancelled", "rescheduled", "no-show"]),
    );
    expect(APPOINTMENT_TRANSITIONS.approved).not.toContain("approved");
    expect(APPOINTMENT_TRANSITIONS.approved).not.toContain("rejected");
  });

  it("rescheduled can be approved/completed/cancelled/no-show", () => {
    expect(APPOINTMENT_TRANSITIONS.rescheduled).toEqual(
      expect.arrayContaining(["approved", "completed", "cancelled", "no-show"]),
    );
  });

  it("terminal states allow nothing", () => {
    const terminal: AppointmentStatus[] = ["rejected", "cancelled", "completed", "no-show"];
    for (const s of terminal) {
      expect(APPOINTMENT_TRANSITIONS[s]).toEqual([]);
    }
  });
});

describe("assertTransitionAllowed", () => {
  it("accepts the full happy path pending → approved → completed", () => {
    expect(() => assertTransitionAllowed("pending", "approved")).not.toThrow();
    expect(() => assertTransitionAllowed("approved", "completed")).not.toThrow();
  });

  it("accepts cancellation and reschedule branches", () => {
    expect(() => assertTransitionAllowed("pending", "cancelled")).not.toThrow();
    expect(() => assertTransitionAllowed("approved", "rescheduled")).not.toThrow();
    expect(() => assertTransitionAllowed("pending", "rescheduled")).not.toThrow();
    expect(() => assertTransitionAllowed("approved", "no-show")).not.toThrow();
    expect(() => assertTransitionAllowed("pending", "rejected")).not.toThrow();
  });

  it("rejects backward and terminal transitions", () => {
    expect(() => assertTransitionAllowed("approved", "pending")).toThrow(
      "Cannot change appointment from approved to pending.",
    );
    expect(() => assertTransitionAllowed("cancelled", "approved")).toThrow();
    expect(() => assertTransitionAllowed("completed", "cancelled")).toThrow();
    expect(() => assertTransitionAllowed("rejected", "approved")).toThrow();
    expect(() => assertTransitionAllowed("no-show", "completed")).toThrow();
  });
});

describe("toFriendlyBookingError", () => {
  it("maps exclusion violations (23P01) to the conflict message", () => {
    const err = { code: "23P01", message: 'violates exclusion constraint "appointments_no_double_booking"' };
    const friendly = toFriendlyBookingError(err);
    expect(friendly).toBeInstanceOf(BookingConflictError);
    expect(friendly.message).toMatch(/just booked by another student/);
  });

  it("passes BookingConflictError through", () => {
    const original = new BookingConflictError();
    expect(toFriendlyBookingError(original)).toBe(original);
  });

  it("maps RLS denials to an authorization message", () => {
    const friendly = toFriendlyBookingError({
      code: "42501",
      message: "new row violates row-level security",
    });
    expect(friendly.message).toMatch(/not authorized/);
  });

  it("maps FK violations to availability message", () => {
    const friendly = toFriendlyBookingError({ code: "23503", message: "fk fail" });
    expect(friendly.message).toMatch(/no longer available/);
  });

  it("passes trigger messages through without leaking internals", () => {
    const friendly = toFriendlyBookingError(
      new Error("Students may only cancel their own appointment requests."),
    );
    expect(friendly.message).toMatch(/only cancel/);
  });

  it("falls back to a generic message", () => {
    expect(toFriendlyBookingError(undefined).message).toMatch(/couldn't process/);
    expect(toFriendlyBookingError(null).message).toMatch(/couldn't process/);
  });
});
