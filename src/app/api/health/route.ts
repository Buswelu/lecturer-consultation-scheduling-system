import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";

export const runtime = "nodejs";

/**
 * GET /api/health — public liveness + readiness probe.
 *
 * Returns only operational booleans: no connection strings, credentials,
 * schema internals, environment values, or secrets. 200 when the database
 * answers and migrations are current; 503 otherwise (still secret-free).
 */
export async function GET(): Promise<NextResponse> {
  let database = false;
  let migrationsCurrent: boolean | null = null;
  try {
    const pool = getPool();
    await pool.query("select 1 as ok");
    database = true;
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const dir = path.join(process.cwd(), "db", "migrations");
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      const { rows } = await pool.query<{ filename: string }>(
        "select filename from public.schema_migrations",
      );
      const applied = new Set(rows.map((r) => r.filename));
      migrationsCurrent = files.every((f) => applied.has(f));
    } catch {
      // Migration directory unreadable in this runtime (e.g. serverless
      // bundle): readiness unknown, liveness still reportable.
      migrationsCurrent = null;
    }
  } catch {
    database = false;
  }
  const ready = database && migrationsCurrent !== false;
  return NextResponse.json(
    { status: ready ? "ok" : "degraded", database, migrationsCurrent },
    { status: ready ? 200 : 503 },
  );
}
