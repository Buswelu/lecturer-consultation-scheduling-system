import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  deleteDepartment,
  getDepartment,
  updateDepartment,
} from "@/lib/db/repositories/academic";
import { ok, pgContext, pgErrorResponse, readJson } from "@/lib/auth/request";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  code: z.string().trim().max(50).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await pgContext(_request);
    const { id } = await params;
    const department = await getDepartment(id);
    if (!department) return pgErrorResponse(new Error("Department not found."));
    return ok({ department });
  } catch (err) {
    return pgErrorResponse(err);
  }
}

/** PATCH /api/departments/[id] — admins only. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await pgContext(request, ["admin"]);
    const { id } = await params;
    const parsed = patchSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return pgErrorResponse(new Error("Please check the department details and try again."));
    }
    const department = await updateDepartment(actor, id, parsed.data);
    return ok({ department });
  } catch (err) {
    return pgErrorResponse(err);
  }
}

/** DELETE /api/departments/[id] — admins only. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await pgContext(request, ["admin"]);
    const { id } = await params;
    await deleteDepartment(actor, id);
    return ok({ ok: true });
  } catch (err) {
    return pgErrorResponse(err);
  }
}
