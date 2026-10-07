import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import {
  assignCourse,
  createCourseAs,
  createDepartment,
  deleteDepartment,
  getCourse,
  listCourses,
  listDepartments,
  unassignCourse,
  updateCourseAs,
  updateDepartment,
} from "./academic";
import {
  cleanupAcademic,
  makeFixture,
  setupSuite,
  teardownSuite,
} from "./fixtures";

const TAG = "tdbacad";

beforeAll(async () => {
  await setupSuite(TAG);
});

afterAll(async () => {
  await teardownSuite(() => cleanupAcademic("TDB-%"));
});

describe("departments repository", () => {
  it("admin creates, updates, and deletes departments", async () => {
    const { adminActor } = await makeFixture("dept");
    const created = await createDepartment(adminActor, {
      name: `TDB-Dept-${Date.now()}`,
      code: `TDB${Math.floor(Math.random() * 100000)}`,
    });
    expect(created.id).toBeDefined();
    const updated = await updateDepartment(adminActor, created.id, {
      description: "renamed",
    });
    expect(updated.description).toBe("renamed");
    await deleteDepartment(adminActor, created.id);
    const all = await listDepartments();
    expect(all.find((d) => d.id === created.id)).toBeUndefined();
  });

  it("rejects duplicate department names", async () => {
    const { adminActor } = await makeFixture("deptdup");
    const name = `TDB-Dup-${Date.now()}`;
    await createDepartment(adminActor, { name });
    await expect(createDepartment(adminActor, { name })).rejects.toThrow(/already exists/);
  });

  it("students cannot manage departments", async () => {
    const { studentActor } = await makeFixture("deptdenied");
    await expect(
      createDepartment(studentActor, { name: `TDB-No-${Date.now()}` }),
    ).rejects.toThrow(/not authorized/);
  });
});

describe("courses repository", () => {
  it("lecturer creates a course scoped to self; admin reads assignments", async () => {
    const fx = await makeFixture("course");
    const { rows: deps } = await getPool().query<{ id: string }>(
      "select id from public.departments limit 1",
    );
    const code = `TDB${Math.floor(Math.random() * 1000000)}`;
    const created = await createCourseAs(
      fx.lecturerActor,
      { title: "TDB Course", code, departmentId: deps[0].id },
      "00000000-0000-0000-0000-000000000000",
    );
    // Spoofed lecturer id ignored: assignment belongs to the caller.
    expect(created.lecturerIds).toEqual([fx.lecturerActor.lecturerId]);
    const fetched = await getCourse(created.id);
    expect(fetched?.code).toBe(code);
    const mine = await listCourses({ lecturerId: fx.lecturerActor.lecturerId as string });
    expect(mine.map((c) => c.id)).toContain(created.id);
  });

  it("lecturer cannot edit another lecturer's course", async () => {
    const a = await makeFixture("coursea");
    const b = await makeFixture("courseb");
    const { rows: deps } = await getPool().query<{ id: string }>(
      "select id from public.departments limit 1",
    );
    const created = await createCourseAs(
      a.lecturerActor,
      { title: "TDB Other", code: `TDB${Math.floor(Math.random() * 1000000)}`, departmentId: deps[0].id },
    );
    await expect(
      updateCourseAs(b.lecturerActor, created.id, { title: "Hijacked" }),
    ).rejects.toThrow(/not authorized/);
  });

  it("assignment is idempotent; unassign removes", async () => {
    const fx = await makeFixture("courseassign");
    const before = await listCourses({ lecturerId: fx.lecturerActor.lecturerId as string });
    await assignCourse(fx.lecturerActor, fx.courseId, fx.lecturerActor.lecturerId as string);
    await assignCourse(fx.lecturerActor, fx.courseId, fx.lecturerActor.lecturerId as string);
    const after = await listCourses({ lecturerId: fx.lecturerActor.lecturerId as string });
    expect(after.length).toBe(before.length);
  });

  it("unassign then reassign round-trips", async () => {
    const fx = await makeFixture("courseunassign");
    const lid = fx.lecturerActor.lecturerId as string;
    await unassignCourse(fx.adminActor, fx.courseId, lid);
    expect((await listCourses({ lecturerId: lid })).map((c) => c.id)).not.toContain(fx.courseId);
    await assignCourse(fx.adminActor, fx.courseId, lid);
    expect((await listCourses({ lecturerId: lid })).map((c) => c.id)).toContain(fx.courseId);
  });

  it("credits persist on create, read, and edit; invalid rejected", async () => {
    const fx = await makeFixture("credits");
    const { rows: deps } = await getPool().query<{ id: string }>(
      "select id from public.departments limit 1",
    );
    const code = `TDB${Math.floor(Math.random() * 1000000)}`;
    const created = await createCourseAs(fx.adminActor, {
      title: "TDB Credits",
      code,
      departmentId: deps[0].id,
      credits: 4,
    });
    expect(created.credits).toBe(4);
    expect((await getCourse(created.id))?.credits).toBe(4);
    const updated = await updateCourseAs(fx.adminActor, created.id, { credits: 2 });
    expect(updated.credits).toBe(2);
    expect((await getCourse(created.id))?.credits).toBe(2);
    await expect(
      createCourseAs(fx.adminActor, {
        title: "TDB Bad Credits",
        code: `TDB${Math.floor(Math.random() * 1000000)}`,
        departmentId: deps[0].id,
        credits: 0,
      }),
    ).rejects.toThrow(/Credits/);
    await expect(
      createCourseAs(fx.adminActor, {
        title: "TDB Bad Credits",
        code: `TDB${Math.floor(Math.random() * 1000000)}`,
        departmentId: deps[0].id,
        credits: 13,
      }),
    ).rejects.toThrow(/Credits/);
    // Database-level guard agrees (bypasses application validation).
    await expect(
      getPool().query("update public.courses set credits = 99 where id = $1", [created.id]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
