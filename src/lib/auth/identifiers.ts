/**
 * LCSS — login identifier model (universal: safe for browser + server).
 *
 * Primary login handle per role (prefix namespaces are disjoint by design):
 *   student:  STU-YYYY-NNNN  (e.g. STU-2026-0001)
 *   lecturer: LEC-YYYY-NNNN  (e.g. LEC-2026-0001)
 *   admin:    ADM-NNNN       (e.g. ADM-0001)
 * Email remains the recovery address and a backup login handle.
 *
 * Pure functions only — no database, no network. Instant client-side format
 * feedback uses these; the server re-validates everything.
 */
import type { PgPublicRole, PgRole } from "./users";

export type IdentifierCategory = "student" | "lecturer" | "admin";

const STUDENT_RE = /^STU-(\d{4})-(\d{4,})$/;
const LECTURER_RE = /^LEC-(\d{4})-(\d{4,})$/;
const ADMIN_RE = /^ADM-(\d{4,})$/;

/** Normalize for comparison/lookup: trim + uppercase. */
export function normalizeIdentifier(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toUpperCase();
}

/** True when the value looks like an email address (backup login path). */
export function isEmailLike(value: string): boolean {
  return value.includes("@");
}

export interface ParsedIdentifier {
  valid: boolean;
  normalized: string;
  category: IdentifierCategory | null;
}

/** Validate format + determine category. Never touches the database. */
export function parseIdentifier(raw: unknown): ParsedIdentifier {
  const normalized = normalizeIdentifier(raw);
  if (!normalized) return { valid: false, normalized: "", category: null };
  if (STUDENT_RE.test(normalized)) return { valid: true, normalized, category: "student" };
  if (LECTURER_RE.test(normalized)) return { valid: true, normalized, category: "lecturer" };
  if (ADMIN_RE.test(normalized)) return { valid: true, normalized, category: "admin" };
  return { valid: false, normalized, category: null };
}

/** Render an identifier from a category, year, and sequence value. */
export function formatIdentifier(
  category: IdentifierCategory,
  year: number,
  seq: number,
): string {
  const padded = String(Math.max(0, Math.floor(seq))).padStart(4, "0");
  if (category === "admin") return `ADM-${padded}`;
  return `${category === "student" ? "STU" : "LEC"}-${year}-${padded}`;
}

/** Database sequence backing each category (concurrency-safe generation). */
export function sequenceForCategory(category: IdentifierCategory): string {
  switch (category) {
    case "student":
      return "public.student_number_seq";
    case "lecturer":
      return "public.lecturer_number_seq";
    case "admin":
      return "public.admin_number_seq";
  }
}

/** Public-registration roles map 1:1 to identifier categories. */
export function categoryForPublicRole(role: PgPublicRole): IdentifierCategory {
  return role;
}

/** All roles map to an identifier category (admin included). */
export function categoryForRole(role: PgRole): IdentifierCategory {
  return role;
}
