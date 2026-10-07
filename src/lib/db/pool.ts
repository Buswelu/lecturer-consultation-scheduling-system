/**
 * LCSS — centralized PostgreSQL connection pool (self-managed backend).
 *
 * SERVER-ONLY (enforced via the `server-only` package): the browser must
 * never import this module. The connection string comes exclusively from
 * the server-side `DATABASE_URL` environment variable — never from a
 * `NEXT_PUBLIC_*` variable and never hard-coded.
 */
import "server-only";
import { Pool, type PoolConfig } from "pg";

/**
 * Name of the local development database. Destructive scripts
 * (`db:reset`) refuse to run against any other database.
 */
export const LCSS_DEV_DATABASE = "Consultation_db";

let pool: Pool | null = null;

function buildConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local, e.g. " +
        "DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/Consultation_db",
    );
  }
  return {
    connectionString,
    // Single shared pool per server process; never one client per request.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}

/**
 * Process-wide singleton pool. Safe to call from any server context
 * (Route Handlers, Server Actions, Server Components, scripts).
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(buildConfig());
    pool.on("error", (err) => {
      // Idle-client errors must not crash silently; surface them server-side.
      console.error("[db] idle pool client error", err);
    });
  }
  return pool;
}

/** Masked connection summary for diagnostics (never includes secrets). */
export interface ConnectionInfo {
  database: string;
  host: string;
  port: number;
  version: string;
}

/**
 * Verify the server is reachable and report which database/version answered.
 * Throws when unreachable. Never logs credentials.
 */
export async function checkConnection(): Promise<ConnectionInfo> {
  const client = await getPool().connect();
  try {
    const versionRes = await client.query<{ version: string }>(
      "select version() as version",
    );
    const dbRes = await client.query<{ database: string; host: string; port: number }>(
      "select current_database() as database, " +
        "inet_server_addr()::text as host, inet_server_port() as port",
    );
    const row = dbRes.rows[0];
    return {
      database: row.database,
      host: row.host ?? "localhost",
      port: Number(row.port) || 5432,
      version: versionRes.rows[0].version,
    };
  } finally {
    client.release();
  }
}

/** Graceful shutdown (scripts / tests). Long-lived servers never call this. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
