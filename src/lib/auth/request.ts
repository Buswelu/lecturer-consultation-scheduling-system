/**
 * LCSS — shared data-route helpers (server-only).
 *
 * Resolves the PostgreSQL session + repository actor from the request
 * cookie, parses JSON bodies safely, and maps service errors to safe HTTP
 * responses (never SQL, credentials, or stack traces).
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, sessionTokenFromCookieHeader } from "./session";
import { resolveActor, type Actor } from "@/lib/db/repositories/types";
import { PgAuthError } from "./require";
import { BookingConflictError } from "@/lib/scheduling/slots";
import type { PgSession } from "./session";

export interface PgRequestContext {
  session: PgSession;
  actor: Actor;
}

/**
 * Require an authenticated session and resolve the repository actor.
 * Pass `roles` to additionally enforce one of the given roles (403 else).
 */
export async function pgContext(
  request: NextRequest,
  roles?: PgSession["role"][],
): Promise<PgRequestContext> {
  const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
  const session = await getSessionUser(token);
  if (!session) {
    throw new PgAuthError(401, "You must be signed in to continue.");
  }
  if (roles && !roles.includes(session.role)) {
    throw new PgAuthError(403, "You are not authorized to perform this action.");
  }
  const actor = await resolveActor(session);
  return { session, actor };
}

/** Read a JSON body, returning `{}` for empty/invalid payloads. */
export async function readJson<T>(request: NextRequest): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

/** Map a service/repository error onto a safe JSON response. */
export function pgErrorResponse(err: unknown): NextResponse {
  if (err instanceof PgAuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (
    err instanceof Error &&
    "status" in err &&
    typeof (err as { status?: unknown }).status === "number"
  ) {
    const status = (err as { status: number }).status;
    return NextResponse.json({ error: err.message }, { status });
  }
  if (err instanceof BookingConflictError) {
    return NextResponse.json({ error: err.message, code: "CONFLICT" }, { status: 409 });
  }
  const message =
    err instanceof Error && err.message
      ? err.message
      : "We couldn't process your request right now.";
  const status = /not found/i.test(message) ? 404 : 400;
  return NextResponse.json({ error: message }, { status });
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}
