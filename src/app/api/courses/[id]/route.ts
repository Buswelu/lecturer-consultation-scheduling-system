import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCourse, updateCourseAs } from "@/lib/db/repositories/academic";
import { ok, pgContext, pgErrorResponse, readJson } from "@/lib/auth/request";

export const runtime = "nodejs";

const patchSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  code: z.string().trim().min(2).max(50).optional(),
  departmentId: z.string().uuid().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  credits: z.number().int().min(1).max(12).optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await pgContext(_request);
    const { id } = await params;
    const course = await getCourse(id);
    if (!course) return pgErrorResponse(new Error("Course not found."));
    return ok({ course });
  } catch (err) {
    return pgErrorResponse(err);
  }
}

/** PATCH /api/courses/[id] — owning lecturer (assigned) or admin. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await pgContext(request, ["lecturer", "admin"]);
    const { id } = await params;
    const parsed = patchSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return pgErrorResponse(new Error("Please check the course details and try again."));
    }
    const course = await updateCourseAs(actor, id, {
      ...parsed.data,
      description: parsed.data.description ?? undefined,
    });
    return ok({ course });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
