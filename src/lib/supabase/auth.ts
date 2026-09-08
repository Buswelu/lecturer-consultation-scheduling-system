/**
 * LCSS — Supabase Auth helpers (Phase 3: authentication).
 *
 * Client-safe: uses the browser client only. Every function throws a clear
 * error when Supabase is not configured.
 *
 * The role NEVER comes from client input — it is read from the trusted
 * `profiles` table for the authenticated user. Public signup can only ever
 * produce student/lecturer accounts (enforced by the RLS
 * `profiles_insert_own` policy, the `prevent_role_escalation` trigger, and
 * the whitelists below).
 */
import { getSupabase } from "./client";
import type { DbRole, Tables } from "./database.types";

export type ProfileRow = Tables<"profiles">;

export type PublicRole = Extract<DbRole, "student" | "lecturer">;

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }
  return supabase;
}

// ---------------------------------------------------------------------------
// Pure helpers (no Supabase dependency — unit-testable)
// ---------------------------------------------------------------------------

/** Dashboard landing page for a role. */
export function dashboardPathForRole(role: DbRole): string {
  switch (role) {
    case "student":
      return "/student/dashboard";
    case "lecturer":
      return "/lecturer/dashboard";
    case "admin":
      return "/admin/dashboard";
  }
}

/** Route prefix owned by a role (used for authorization + safe redirects). */
export function rolePathPrefix(role: DbRole): string {
  switch (role) {
    case "student":
      return "/student";
    case "lecturer":
      return "/lecturer";
    case "admin":
      return "/admin";
  }
}

/**
 * Validate a `?next=` redirect target: must be a same-origin relative path
 * (blocks open redirects such as `//evil.com` or `https://…`).
 */
export function isSafeNextPath(next: string | null | undefined): next is string {
  if (!next) return false;
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\");
}

/** Does this path belong to the given role's area? */
export function isPathForRole(path: string, role: DbRole): boolean {
  return path === rolePathPrefix(role) || path.startsWith(`${rolePathPrefix(role)}/`);
}

/** User-facing message for a sign-in failure (never leaks backend detail). */
export function mapSignInError(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid email or password")
  ) {
    return "Invalid email or password.";
  }
  if (
    normalized.includes("email not confirmed") ||
    normalized.includes("not confirmed")
  ) {
    return "Please check your email to confirm your account.";
  }
  return "We couldn't process your request right now.";
}

/** User-facing message for a sign-up failure (never confirms email existence). */
export function mapSignUpError(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("already registered") ||
    normalized.includes("already exists") ||
    normalized.includes("duplicate")
  ) {
    return "Unable to create your account. Please try again.";
  }
  if (normalized.includes("password")) {
    return "Please choose a stronger password and try again.";
  }
  return "Unable to create your account. Please try again.";
}

/**
 * Whitelist a role coming from auth metadata (signup). Anything else —
 * especially "admin" — falls back to "student". The database remains the
 * source of truth afterwards; this only seeds the initial row, and RLS
 * rejects anything outside student/lecturer anyway.
 */
export function sanitizePublicRole(role: unknown): PublicRole {
  return role === "lecturer" ? "lecturer" : "student";
}

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  /** Public registration may only request student/lecturer — never admin. */
  role: PublicRole;
  /** Where the confirmation email should return (must be allow-listed). */
  emailRedirectTo?: string;
}

export interface AuthResult {
  userId: string;
  /** True when email confirmation is required before a session exists. */
  needsConfirmation: boolean;
}

/**
 * Create the Supabase Auth user only.
 *
 * Profile/student/lecturer rows are NOT created here: when email confirmation
 * is enabled there is no session yet, so RLS would deny the inserts.
 * `ensureUserProfile()` (called on first sign-in) creates them instead.
 */
export async function signUp(input: SignUpInput): Promise<AuthResult> {
  const supabase = requireClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName, role: input.role },
      ...(input.emailRedirectTo ? { emailRedirectTo: input.emailRedirectTo } : {}),
    },
  });
  if (error) throw error;
  const user = data.user;
  if (!user) throw new Error("Sign-up did not return a user.");
  return { userId: user.id, needsConfirmation: !data.session };
}

/**
 * Ensure `profiles` (+ `students`/`lecturers`) rows exist for a signed-in
 * user, creating them on first login. The initial role comes from the
 * whitelisted signup metadata; afterwards the database row is authoritative.
 * Safe to call on every sign-in (idempotent).
 */
export async function ensureUserProfile(input: {
  userId: string;
  email?: string | null;
  fullName?: string | null;
  role?: unknown;
}): Promise<ProfileRow> {
  const supabase = requireClient();
  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", input.userId)
    .single();
  if (existing) return existing;

  const role = sanitizePublicRole(input.role);
  const fullName =
    input.fullName?.trim() || input.email?.split("@")[0] || "New User";

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      id: input.userId,
      full_name: fullName,
      email: input.email ?? null,
      role,
    })
    .select()
    .single();
  if (profileError || !profile) {
    // Possible race (row created concurrently) — re-read before failing.
    const { data: retry } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", input.userId)
      .single();
    if (retry) return retry;
    throw profileError ?? new Error("Could not set up your account profile.");
  }

  const detailTable = role === "student" ? "students" : "lecturers";
  const { error: detailError } = await supabase
    .from(detailTable)
    .insert({ profile_id: input.userId });
  if (detailError) {
    // Profile exists; the detail row can be repaired later — don't block login.
  }
  return profile;
}

/** Sign in with email + password. */
export async function signIn(input: {
  email: string;
  password: string;
}): Promise<{
  userId: string;
  email: string | null;
  fullName: string | null;
  role: unknown;
}> {
  const supabase = requireClient();
  const { data, error } = await supabase.auth.signInWithPassword(input);
  if (error) throw error;
  if (!data.user) throw new Error("Sign-in did not return a user.");
  const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    fullName:
      typeof metadata.full_name === "string" ? metadata.full_name : null,
    role: metadata.role,
  };
}

/** Sign out the current session (all tabs via browser client scope). */
export async function signOut(): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Send a password-reset email (generic result — never reveals existence). */
export async function sendPasswordResetEmail(
  email: string,
  redirectTo?: string,
): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    ...(redirectTo ? { redirectTo } : {}),
  });
  if (error) throw error;
}

/**
 * Set a new password for the current user. Used by the reset-password page
 * with the recovery session established from the email link.
 */
export async function updatePassword(newPassword: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** Current auth user id, or null when signed out / unconfigured. */
export async function getSessionUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Trusted profile row of the signed-in user (role source of truth). */
export async function getCurrentProfile(): Promise<ProfileRow | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .single();
  if (error) return null;
  return data;
}

/** Trusted role of the signed-in user, resolved from the database. */
export async function getCurrentRole(): Promise<DbRole | null> {
  const profile = await getCurrentProfile();
  return profile?.role ?? null;
}

/** Student detail row (+ profile) of the signed-in student, if any. */
export async function getCurrentStudent(): Promise<{
  profile: ProfileRow;
  student: Tables<"students">;
} | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .single();
  if (!profile || profile.role !== "student") return null;
  const { data: student, error } = await supabase
    .from("students")
    .select("*")
    .eq("profile_id", auth.user.id)
    .single();
  if (error || !student) return null;
  return { profile, student };
}

/** Lecturer detail row (+ profile) of the signed-in lecturer, if any. */
export async function getCurrentLecturer(): Promise<{
  profile: ProfileRow;
  lecturer: Tables<"lecturers">;
} | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .single();
  if (!profile || profile.role !== "lecturer") return null;
  const { data: lecturer, error } = await supabase
    .from("lecturers")
    .select("*")
    .eq("profile_id", auth.user.id)
    .single();
  if (error || !lecturer) return null;
  return { profile, lecturer };
}
