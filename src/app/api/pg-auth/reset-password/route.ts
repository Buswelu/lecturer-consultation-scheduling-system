import { NextResponse, type NextRequest } from "next/server";
import { resetPgPassword } from "@/lib/auth/users";

export const runtime = "nodejs";

/**
 * POST /api/pg-auth/reset-password — consume a reset token + set new password.
 * The token is single-use; all sessions are revoked on success.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { token?: unknown; password?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  try {
    await resetPgPassword({
      token: typeof body.token === "string" ? body.token : "",
      password: typeof body.password === "string" ? body.password : "",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "This link is invalid or has expired.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
