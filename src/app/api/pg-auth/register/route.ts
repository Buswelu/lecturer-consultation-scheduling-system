import { NextResponse, type NextRequest } from "next/server";
import { getClientIp } from "@/lib/security/get-client-ip";
import { registerPgUser } from "@/lib/auth/users";

export const runtime = "nodejs";

/**
 * POST /api/pg-auth/register — self-managed PostgreSQL registration.
 *
 * Pre-cutover parallel route mirroring POST /api/auth/register's generic
 * responses (never reveals whether an email is taken). No session is created
 * here: email verification comes first (see verify-email route).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { email?: unknown; password?: unknown; fullName?: unknown; role?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const ip = getClientIp(request.headers);
  try {
    const result = await registerPgUser({
      email: typeof body.email === "string" ? body.email : "",
      password: typeof body.password === "string" ? body.password : "",
      fullName: typeof body.fullName === "string" ? body.fullName : "",
      role: body.role,
      ip,
    });
    return NextResponse.json({
      ok: true,
      userId: result.user.id,
      username: result.user.username,
      needsVerification: result.needsVerification,
      ...(result.devToken ? { devToken: result.devToken } : {}),
    });
  } catch (err) {
    const status =
      err instanceof Error && "status" in err &&
      (err as { status?: unknown }).status === 429
        ? 429
        : 400;
    if (status === 429) {
      const retryAfter =
        err instanceof Error && "retryAfterSeconds" in err
          ? ((err as { retryAfterSeconds?: unknown }).retryAfterSeconds as number | null)
          : null;
      const res = NextResponse.json(
        { error: "Too many requests. Please try again later.", retryAfterSeconds: retryAfter },
        { status: 429 },
      );
      if (retryAfter !== null && retryAfter !== undefined) {
        res.headers.set("Retry-After", String(retryAfter));
      }
      return res;
    }
    const message = err instanceof Error ? err.message : "Unable to create your account. Please try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
