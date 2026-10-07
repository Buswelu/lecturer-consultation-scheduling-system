import type { NextRequest } from "next/server";
import { z } from "zod";
import { createDepartment, listDepartments } from "@/lib/db/repositories/academic";
import { ok, pgContext, pgErrorResponse, readJson } from "@/lib/auth/request";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(2).max(200),
  code: z.string().trim().max(50).optional(),
  description: z.string().trim().max(2000).optional(),
});

/** GET /api/departments — reference data for every authenticated role. */
export async function GET(request: NextRequest) {
  try {
    await pgContext(request);
    return ok({ departments: await listDepartments() });
  } catch (err) {
    return pgErrorResponse(err);
  }
}

/** POST /api/departments — admins only. */
export async function POST(request: NextRequest) {
  try {
    const { actor } = await pgContext(request, ["admin"]);
    const parsed = createSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return pgErrorResponse(new Error("Please check the department details and try again."));
    }
    const department = await createDepartment(actor, parsed.data);
    return ok({ department }, 201);
  } catch (err) {
    return pgErrorResponse(err);
  }
}
