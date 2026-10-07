/**
 * LCSS — browser authentication abstraction for self-managed auth.
 *
 * Client-safe: talks ONLY to Next.js `/api/pg-auth/*` routes via fetch.
 * Browser code must never touch PostgreSQL (no `pg`, no DATABASE_URL here).
 */
"use client";

import * as React from "react";
import type { AuthRole } from "./routes";
import { isAuthRole } from "./routes";

export interface PgMeUser {
  id: string;
  email: string;
  username: string;
  role: AuthRole;
  fullName: string;
  studentId: string | null;
  lecturerId: string | null;
}

/** HTTP error from a pg-auth endpoint (carries status + retry hint). */
export class PgAuthClientError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;
  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function readPayload(res: Response): Promise<{
  error?: unknown;
  retryAfterSeconds?: unknown;
  role?: unknown;
  userId?: unknown;
  username?: unknown;
  needsVerification?: unknown;
  devToken?: unknown;
  id?: unknown;
  email?: unknown;
  fullName?: unknown;
  studentId?: unknown;
  lecturerId?: unknown;
  message?: unknown;
  valid?: unknown;
  category?: unknown;
} | null> {
  return (await res.json().catch(() => null)) as Awaited<
    ReturnType<typeof readPayload>
  >;
}

function rateLimitedMessage(payload: Awaited<ReturnType<typeof readPayload>>): string {
  return typeof payload?.error === "string" && payload.error.length > 0
    ? payload.error
    : "Too many attempts. Please try again later.";
}

function retryAfterOf(payload: Awaited<ReturnType<typeof readPayload>>): number | null {
  return typeof payload?.retryAfterSeconds === "number" ? payload.retryAfterSeconds : null;
}

/** Sign in with registration number / staff number / admin id — or email. */
export async function pgLogin(input: {
  identifier: string;
  password: string;
}): Promise<{ role: AuthRole }> {
  const res = await fetch("/api/pg-auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await readPayload(res);
  if (res.status === 429) {
    throw new PgAuthClientError(rateLimitedMessage(payload), 429, retryAfterOf(payload));
  }
  if (!res.ok || !payload || !isAuthRole(payload.role)) {
    const message =
      typeof payload?.error === "string" && payload.error.length > 0
        ? payload.error
        : "Invalid username or password.";
    throw new PgAuthClientError(message, res.status || 401);
  }
  return { role: payload.role };
}

/** Register a student/lecturer account. Never creates admins. */
export async function pgRegister(input: {
  email: string;
  password: string;
  fullName: string;
  role: "student" | "lecturer";
}): Promise<{ userId: string; username: string; needsVerification: boolean; devToken?: string }> {
  const res = await fetch("/api/pg-auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await readPayload(res);
  if (res.status === 429) {
    throw new PgAuthClientError(rateLimitedMessage(payload), 429, retryAfterOf(payload));
  }
  if (!res.ok || !payload || typeof payload.userId !== "string") {
    const message =
      typeof payload?.error === "string" && payload.error.length > 0
        ? payload.error
        : "Unable to create your account. Please try again.";
    throw new PgAuthClientError(message, res.status || 400);
  }
  return {
    userId: payload.userId,
    username: typeof payload.username === "string" ? payload.username : "",
    needsVerification: payload.needsVerification !== false,
    ...(typeof payload.devToken === "string" ? { devToken: payload.devToken } : {}),
  };
}

/** Sign out: server invalidates the session and clears the cookie. */
export async function pgLogout(): Promise<void> {
  try {
    await fetch("/api/pg-auth/logout", { method: "POST" });
  } catch {
    // Proceed to login even when the request fails (session may be gone).
  }
}

/** Current session user, or null when signed out / session expired. */
export async function getPgCurrentUser(): Promise<PgMeUser | null> {
  let res: Response;
  try {
    // Never serve a stale identity: session state must always be revalidated.
    res = await fetch("/api/pg-auth/me", { method: "GET", cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const payload = await readPayload(res);
  if (
    !payload ||
    typeof payload.id !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.username !== "string" ||
    !isAuthRole(payload.role) ||
    typeof payload.fullName !== "string"
  ) {
    return null;
  }
  return {
    id: payload.id,
    email: payload.email,
    username: payload.username,
    role: payload.role,
    fullName: payload.fullName,
    studentId: typeof payload.studentId === "string" ? payload.studentId : null,
    lecturerId: typeof payload.lecturerId === "string" ? payload.lecturerId : null,
  };
}

/** Request a password-reset link by identifier or email (always generic). */
export async function pgRequestPasswordReset(username: string): Promise<void> {
  const res = await fetch("/api/pg-auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (res.status === 429) {
    const payload = await readPayload(res);
    throw new PgAuthClientError(rateLimitedMessage(payload), 429, retryAfterOf(payload));
  }
  // Any other status still resolves: the server response is generic by design.
}

/** Consume a reset token and set a new password. */
export async function pgResetPassword(input: {
  token: string;
  password: string;
}): Promise<void> {
  const res = await fetch("/api/pg-auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const payload = await readPayload(res);
    const message =
      typeof payload?.error === "string" && payload.error.length > 0
        ? payload.error
        : "We couldn't update your password. The link may have expired.";
    throw new PgAuthClientError(message, res.status || 400);
  }
}

/**
 * Authenticated-user hook with loading state. Returns `user: null` once
 * loading finishes when signed out (never flashes protected content — pages
 * gate on `loading` first).
 */
export function usePgCurrentUser(): { user: PgMeUser | null; loading: boolean } {
  const [state, setState] = React.useState<{ user: PgMeUser | null } | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    getPgCurrentUser()
      .then((user) => {
        if (!cancelled) setState({ user });
      })
      .catch(() => {
        if (!cancelled) setState({ user: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!state) return { user: null, loading: true };
  return { user: state.user, loading: false };
}
