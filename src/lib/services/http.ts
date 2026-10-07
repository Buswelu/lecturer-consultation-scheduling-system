/**
 * LCSS — browser API helper for PostgreSQL-backed services.
 *
 * Universal fetch wrapper (no React): every data request goes to Next.js
 * API routes with `cache: "no-store"` (appointment/availability data must
 * never be stale). Server errors map to safe client errors; 409 conflicts
 * become BookingConflictError. No SQL, no secrets, no pg here.
 */
import { BookingConflictError } from "@/lib/scheduling/slots";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface ErrorPayload {
  error?: unknown;
  code?: unknown;
}

async function throwForResponse(res: Response): Promise<never> {
  let payload: ErrorPayload | null = null;
  try {
    payload = (await res.json()) as ErrorPayload;
  } catch {
    payload = null;
  }
  const message =
    payload && typeof payload.error === "string" && payload.error.length > 0
      ? payload.error
      : "We couldn't process your request right now.";
  const code = payload && typeof payload.code === "string" ? payload.code : undefined;
  if (res.status === 409 || code === "CONFLICT") {
    throw new BookingConflictError(message !== "We couldn't process your request right now." ? message : undefined);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ApiError("You are not authorized to perform this action.", res.status, code);
  }
  throw new ApiError(message, res.status || 400, code);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "GET", cache: "no-store" });
  if (!res.ok) await throwForResponse(res);
  return (await res.json()) as T;
}

export async function apiSend<T>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) await throwForResponse(res);
  return (await res.json()) as T;
}

export function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
