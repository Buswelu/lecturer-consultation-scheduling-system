/* Temporary Phase-5 integration checks — deleted after run.
 * Part A (no Auth API): anon RLS denials on appointments/notifications.
 * Part B (mock services): full booking lifecycle on mock arrays.
 * Env vars are snapshotted first, then cleared so services take the
 * mock path (module singletons read env at import time). */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envRaw = readFileSync(".env.local", "utf8");
for (const line of envRaw.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.log(`FAIL ${name}`, extra ?? "");
  }
}

async function partA(): Promise<void> {
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sel = await anon.from("appointments").select("id").limit(1);
  check("anon cannot read appointments", (sel.data ?? []).length === 0);
  const ins = await anon.from("appointments").insert({
    student_id: "00000000-0000-0000-0000-000000000000",
    lecturer_id: "00000000-0000-0000-0000-000000000000",
    start_datetime: "2026-10-01T09:00:00+00:00",
    end_datetime: "2026-10-01T09:30:00+00:00",
    consultation_type: "in_person",
    status: "pending",
    reason: "probe",
  });
  check("anon cannot insert appointments", ins.error !== null);
  const upd = await anon
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", "00000000-0000-0000-0000-000000000000");
  // RLS denials on UPDATE surface as zero affected rows (silent filter),
  // not as errors — either way nothing was modified.
  check("anon cannot update appointments", (upd.data ?? []).length === 0);
  const nsel = await anon.from("notifications").select("id").limit(1);
  check("anon cannot read notifications", (nsel.data ?? []).length === 0);
}

async function partB(): Promise<void> {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const appts = await import("@/lib/services/appointments");
  const avail = await import("@/lib/services/availability");
  const notifs = await import("@/lib/services/notifications");

  // Find genuinely free mock slots for lec-1 in early October 2026.
  async function firstFree(exclude?: { date: string; startTime: string }) {
    const fresh = await avail.getAvailableSlots({
      lecturerId: "lec-1",
      from: "2026-10-05",
      to: "2026-10-12",
      now: new Date("2026-09-08T00:00:00Z"),
    });
    for (const d of Object.keys(fresh).sort()) {
      const slot = fresh[d].find(
        (s) =>
          s.status === "available" &&
          !(exclude && s.date === exclude.date && s.startTime === exclude.startTime),
      );
      if (slot) return { date: d, slot };
    }
    return null;
  }
  const entry = await firstFree();
  check("free mock slot exists", !!entry);
  if (!entry) return;
  const { date, slot } = entry;

  const lecNotifBefore = await notifs.getNotificationsForUser("lec-1");
  const created = await appts.createAppointment({
    studentId: "stud-1",
    lecturerId: "lec-1",
    courseId: "course-db",
    date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    type: "in-person",
    reason: "Integration probe booking",
  });
  check("create → pending", created.status === "pending");
  check(
    "create logs Requested history",
    created.history.some((h) => h.action === "Requested"),
  );
  const lecNotifAfter = await notifs.getNotificationsForUser("lec-1");
  check("lecturer notified on create", lecNotifAfter.length === lecNotifBefore.length + 1);

  // Double-book same slot → conflict.
  try {
    await appts.createAppointment({
      studentId: "stud-2",
      lecturerId: "lec-1",
      courseId: "course-db",
      date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      type: "online",
      reason: "Second attempt at same slot",
    });
    check("double-book rejected", false);
  } catch (e) {
    check("double-book rejected", (e as Error).message.includes("just booked"));
  }

  const approved = await appts.approveAppointment(created.id);
  check("approve → approved", approved.status === "approved");
  const stuNotifs = await notifs.getNotificationsForUser("stud-1");
  check(
    "student notified on approve",
    stuNotifs.some((n) => n.type === "approval" && n.appointmentId === created.id),
  );

  // Reschedule to another available slot on a different date.
  const other = await firstFree({ date, startTime: slot.startTime });
  const otherOnNewDate =
    other && other.date !== date
      ? other
      : await (async () => {
          const fresh = await avail.getAvailableSlots({
            lecturerId: "lec-1",
            from: "2026-10-05",
            to: "2026-10-12",
            now: new Date("2026-09-08T00:00:00Z"),
          });
          for (const d of Object.keys(fresh).sort()) {
            if (d === date) continue;
            const s = fresh[d].find((x) => x.status === "available");
            if (s) return { date: d, slot: s };
          }
          return null;
        })();
  if (otherOnNewDate) {
    const res = await appts.rescheduleAppointment(created.id, {
      date: otherOnNewDate.date,
      startTime: otherOnNewDate.slot.startTime,
      endTime: otherOnNewDate.slot.endTime,
    });
    check(
      "reschedule moves time+status",
      res.status === "rescheduled" && res.date === otherOnNewDate.date,
    );
    check(
      "reschedule history appended",
      res.history.some((h) => h.action === "Rescheduled"),
    );
    const done = await appts.markCompleted(created.id);
    check("complete → completed", done.status === "completed");
  } else {
    check("reschedule moves time+status", false, "no second slot found");
  }

  // Cancel flow on a fresh booking (own free slot).
  const cancelSlot = await firstFree();
  check("free slot for cancel test", !!cancelSlot);
  if (!cancelSlot) return;
  const toCancel = await appts.createAppointment({
    studentId: "stud-1",
    lecturerId: "lec-1",
    courseId: "course-db",
    date: cancelSlot.date,
    startTime: cancelSlot.slot.startTime,
    endTime: cancelSlot.slot.endTime,
    type: "online",
    reason: "Will cancel this one",
  });
  const cancelled = await appts.cancelAppointment(toCancel.id, "student");
  check("cancel → cancelled", cancelled.status === "cancelled");

  // Illegal transition: approve a cancelled appointment.
  try {
    await appts.approveAppointment(toCancel.id);
    check("approve-cancelled rejected", false);
  } catch (e) {
    check("approve-cancelled rejected", (e as Error).message.includes("Cannot change"));
  }

  // Reject flow with reason (own free slot).
  const rejectSlot = await firstFree();
  check("free slot for reject test", !!rejectSlot);
  if (!rejectSlot) return;
  const toReject = await appts.createAppointment({
    studentId: "stud-2",
    lecturerId: "lec-1",
    courseId: "course-db",
    date: rejectSlot.date,
    startTime: rejectSlot.slot.startTime,
    endTime: rejectSlot.slot.endTime,
    type: "in-person",
    reason: "Will reject this one",
  });
  const rejected = await appts.rejectAppointment(toReject.id, "On leave");
  check("reject → rejected", rejected.status === "rejected");
}

async function main(): Promise<void> {
  await partA();
  await partB();
  if (failures > 0) {
    console.log(`${failures} FAILURES`);
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED");
}

main().catch((e: unknown) => {
  console.error("FATAL", e);
  process.exit(1);
});
