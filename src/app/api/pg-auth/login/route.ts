import { NextResponse, type NextRequest } from "next/server";
import { getClientIp } from "@/lib/security/get-client-ip";
import { loginPgUser } from "@/lib/auth/users";
import { buildSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * POST /api/pg-auth/login — self-managed PostgreSQL login.
 *
 * Accepts `{ identifier, password }` where identifier is a registration /
 * staff / admin identifier OR an email address (backup path). Legacy
 * `{ username }` / `{ email }` shapes are accepted identically. Both resolve
 * to the same account; failures are generic so neither path leaks existence.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { identifier?: unknown; username?: unknown; email?: unknown; password?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const ip = getClientIp(request.headers);
  try {
    const { user, token, expiresAt } = await loginPgUser({
      identifier: typeof body.identifier === "string" ? body.identifier : undefined,
      username: typeof body.username === "string" ? body.username : undefined,
      email: typeof body.email === "string" ? body.email : undefined,
      password: typeof body.password === "string" ? body.password : "",
      ip,
    });
    const res = NextResponse.json({ ok: true, role: user.role });
    const cookie = buildSessionCookie(token);
    res.cookies.set(cookie.name, cookie.value, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: cookie.options.maxAge,
      secure: cookie.options.secure,
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    const status =
      err instanceof Error && "status" in err
        ? ((err as { status?: unknown }).status === 429 ? 429 : 401)
        : 401;
    if (status === 429) {
      const retryAfter =
        err instanceof Error && "retryAfterSeconds" in err
          ? ((err as { retryAfterSeconds?: unknown }).retryAfterSeconds as number | null)
          : null;
      const res = NextResponse.json(
        {
          error: "Too many login attempts. Please try again later.",
          retryAfterSeconds: retryAfter,
        },
        { status: 429 },
      );
      if (retryAfter !== null && retryAfter !== undefined) {
        res.headers.set("Retry-After", String(retryAfter));
      }
      return res;
    }
    const message =
      err instanceof Error ? err.message : "Invalid username or password.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
