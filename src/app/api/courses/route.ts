import type { NextRequest } from "next/server";
import { z } from "zod";
import { createCourseAs, listCourses } from "@/lib/db/repositories/academic";
import { ok, pgContext, pgErrorResponse, readJson } from "@/lib/auth/request";

export const runtime = "nodejs";

const courseSchema = z.object({
  title: z.string().trim().min(2).max(200),
  code: z.string().trim().min(2).max(50),
  departmentId: z.string().uuid(),
  description: z.string().trim().max(2000).optional(),
  lecturerId: z.string().uuid().optional(),
  credits: z.number().int().min(1).max(12).optional(),
});

/** GET /api/courses — reference data for every authenticated role. */
export async function GET(request: NextRequest) {
  try {
    await pgContext(request);
    const params = request.nextUrl.searchParams;
    const courses = await listCourses({
      departmentId: params.get("departmentId") ?? undefined,
      activeOnly: params.get("activeOnly") === "1" || params.get("activeOnly") === "true"
        ? true
        : undefined,
      lecturerId: params.get("lecturerId") ?? undefined,
    });
    return ok({ courses });
  } catch (err) {
    return pgErrorResponse(err);
  }
}

/** POST /api/courses — lecturers (self-scoped) and admins. */
export async function POST(request: NextRequest) {
  try {
    const { actor } = await pgContext(request, ["lecturer", "admin"]);
    const parsed = courseSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return pgErrorResponse(new Error("Please check the course details and try again."));
    }
    const course = await createCourseAs(actor, parsed.data, parsed.data.lecturerId);
    return ok({ course }, 201);
  } catch (err) {
    return pgErrorResponse(err);
  }
}
