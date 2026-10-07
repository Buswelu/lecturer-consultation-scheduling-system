import { NextResponse, type NextRequest } from "next/server";
import { getClientIp } from "@/lib/security/get-client-ip";
import {
  GENERIC_PG_RECOVERY_SUCCESS,
  requestPgPasswordReset,
} from "@/lib/auth/users";

export const runtime = "nodejs";

/**
 * POST /api/pg-auth/forgot-password — request a reset link.
 * Accepts an identifier or an email; always responds generically
 * (never reveals whether the account exists).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { username?: unknown; email?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const ip = getClientIp(request.headers);
  try {
    const result = await requestPgPasswordReset({
      username: typeof body.username === "string" ? body.username : undefined,
      email: typeof body.email === "string" ? body.email : undefined,
      ip,
    });
    return NextResponse.json({
      ok: true,
      message: GENERIC_PG_RECOVERY_SUCCESS,
      ...(result.devToken ? { devToken: result.devToken } : {}),
    });
  } catch (err) {
    const status =
      err instanceof Error && "status" in err &&
      (err as { status?: unknown }).status === 429
        ? 429
        : 400;
    const message = err instanceof Error ? err.message : GENERIC_PG_RECOVERY_SUCCESS;
    if (status === 429) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
