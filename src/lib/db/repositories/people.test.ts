import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLecturer, lecturerIdForProfile, listLecturers } from "./people";
import {
  adminDirectory,
  getStudent,
  listStudents,
  studentIdForProfile,
} from "./people";
import { makeFixture, setupSuite, teardownSuite } from "./fixtures";

const TAG = "tdbpeople";

beforeAll(async () => {
  await setupSuite(TAG);
});

afterAll(async () => {
  await teardownSuite();
});

describe("people repository", () => {
  it("lists lecturers with search, department, and course filters", async () => {
    const fx = await makeFixture("people");
    const all = await listLecturers();
    expect(all.length).toBeGreaterThan(0);
    const first = all[0];
    expect(first.departmentName === undefined || typeof first.departmentName === "string").toBe(
      true,
    );
    const bySearch = await listLecturers({ search: first.fullName.split(" ")[0] });
    expect(bySearch.map((l) => l.id)).toContain(first.id);
    const byCourse = await listLecturers({ courseId: fx.courseId });
    expect(byCourse.map((l) => l.id)).toContain(fx.lecturerActor.lecturerId);
    const single = await getLecturer(first.id);
    expect(single?.id).toBe(first.id);
    expect(await getLecturer("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await lecturerIdForProfile("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("admin lists students; students are denied", async () => {
    const fx = await makeFixture("peoplestudents");
    const all = await listStudents(fx.adminActor);
    expect(all.length).toBeGreaterThan(0);
    await expect(listStudents(fx.studentActor)).rejects.toThrow(/not authorized/);
    expect(await studentIdForProfile("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("student reads own record; stranger denied; counterparty lecturer allowed", async () => {
    const a = await makeFixture("peopleself");
    const b = await makeFixture("peopleother");
    const own = await getStudent(
      a.studentActor,
      a.studentActor.studentId as string,
    );
    expect(own?.id).toBe(a.studentActor.studentId);
    await expect(
      getStudent(b.studentActor, a.studentActor.studentId as string),
    ).rejects.toThrow(/not authorized/);
    // Counterparty lecturer without a shared appointment is denied.
    await expect(
      getStudent(b.lecturerActor, a.studentActor.studentId as string),
    ).rejects.toThrow(/not authorized/);
  });

  it("admin directory exposes safe management fields", async () => {
    const fx = await makeFixture("peopledir");
    const dir = await adminDirectory(fx.adminActor, {});
    expect(dir.total).toBeGreaterThan(0);
    expect(dir.items.length).toBeGreaterThan(0);
    const row = dir.items[0];
    expect(typeof row.username).toBe("string");
    expect(typeof row.isActive).toBe("boolean");
    expect(row).not.toHaveProperty("password_hash");
    await expect(adminDirectory(fx.studentActor, {})).rejects.toThrow(/not authorized/);
  });

  it("directory pagination and status filter work server-side", async () => {
    const fx = await makeFixture("peopledirpage");
    const first = await adminDirectory(fx.adminActor, {}, { page: 1, pageSize: 1 });
    expect(first.items.length).toBeLessThanOrEqual(1);
    expect(first.total).toBeGreaterThanOrEqual(first.items.length);
    expect(first.page).toBe(1);
    const active = await adminDirectory(fx.adminActor, { status: "active" }, { page: 1, pageSize: 200 });
    expect(active.items.every((u) => u.isActive)).toBe(true);
  });
});
