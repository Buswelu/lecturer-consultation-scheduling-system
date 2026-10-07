import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db/pool";
import { PgAuthError, requirePgRole } from "@/lib/auth/require";
import { sessionTokenFromCookieHeader } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * GET /api/admin/overview — admin control-center summary (counts only).
 *
 * Admin-only (`requirePgRole("admin")` on the PostgreSQL session — never a
 * client-supplied role). Exposes row counts and safe summaries; never
 * password hashes, session tokens, secrets, or arbitrary SQL.
 */
const COUNT_TABLES = [
  "users",
  "profiles",
  "students",
  "lecturers",
  "departments",
  "courses",
  "lecturer_courses",
  "availability",
  "availability_exceptions",
  "appointments",
  "appointment_history",
  "notifications",
  "sessions",
  "auth_rate_limits",
  "schema_migrations",
] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
  try {
    await requirePgRole(token, "admin");
  } catch (err) {
    const status = err instanceof PgAuthError ? err.status : 401;
    return NextResponse.json({ error: "Not authorized." }, { status });
  }

  const pool = getPool();
  const tables: Record<string, number> = {};
  for (const table of COUNT_TABLES) {
    // Table names come from a fixed allow-list above — never user input.
    const { rows } = await pool.query<{ count: string }>(
      `select count(*) as count from public.${table}`,
    );
    tables[table] = Number(rows[0].count);
  }
  const [roles, activity, sessions, rateLimits, appointmentsByStatus, availability, notifications] =
    await Promise.all([
      pool.query<{ role: string; count: string }>(
        "select role, count(*) as count from public.profiles group by role",
      ),
      pool.query<{ active: string; inactive: string }>(
        "select count(*) filter (where is_active) as active, count(*) filter (where not is_active) as inactive from public.users",
      ),
      pool.query<{ active: string }>(
        "select count(*) as active from public.sessions where expires_at > now()",
      ),
      pool.query<{ total: string; blocked: string }>(
        "select count(*) as total, count(*) filter (where blocked_until > now()) as blocked from public.auth_rate_limits",
      ),
      pool.query<{ status: string; count: string }>(
        "select status, count(*) as count from public.appointments group by status",
      ),
      pool.query<{ lecturers: string; rules: string; exceptions: string }>(
        "select (select count(distinct lecturer_id) from public.availability where is_active) as lecturers, " +
          "(select count(*) from public.availability) as rules, " +
          "(select count(*) from public.availability_exceptions) as exceptions",
      ),
      pool.query<{ total: string; unread: string }>(
        "select count(*) as total, count(*) filter (where not is_read) as unread from public.notifications",
      ),
    ]);
  const byRole: Record<string, number> = {};
  for (const row of roles.rows) byRole[row.role] = Number(row.count);
  const byStatus: Record<string, number> = {};
  for (const row of appointmentsByStatus.rows) byStatus[row.status] = Number(row.count);

  return NextResponse.json({
    ok: true,
    tables,
    usersByRole: byRole,
    usersActive: Number(activity.rows[0].active),
    usersInactive: Number(activity.rows[0].inactive),
    appointmentsByStatus: byStatus,
    availability: {
      lecturersWithAvailability: Number(availability.rows[0].lecturers),
      rules: Number(availability.rows[0].rules),
      exceptions: Number(availability.rows[0].exceptions),
    },
    notifications: {
      total: Number(notifications.rows[0].total),
      unread: Number(notifications.rows[0].unread),
    },
    activeSessions: Number(sessions.rows[0].active),
    rateLimits: {
      keys: Number(rateLimits.rows[0].total),
      blocked: Number(rateLimits.rows[0].blocked),
    },
  });
}
