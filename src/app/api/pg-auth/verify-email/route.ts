import { NextResponse, type NextRequest } from "next/server";
import { verifyPgEmail } from "@/lib/auth/users";

export const runtime = "nodejs";

/**
 * POST /api/pg-auth/verify-email — consume an email-verification token.
 * Single-use; marks `users.email_verified_at`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { token?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  try {
    const user = await verifyPgEmail(typeof body.token === "string" ? body.token : "");
    return NextResponse.json({ ok: true, email: user.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : "This link is invalid or has expired.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
