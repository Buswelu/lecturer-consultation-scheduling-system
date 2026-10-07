/**
 * LCSS — self-managed PostgreSQL migration runner (Windows + Linux safe).
 *
 * Usage:
 *   node scripts/db/run.mjs migrate   # apply pending db/migrations/*.sql
 *   node scripts/db/run.mjs status    # show applied / pending migrations
 *   node scripts/db/run.mjs seed      # idempotent dev seed data
 *   node scripts/db/run.mjs seed:dev  # dev scenario data (assignments + availability)
 *   node scripts/db/run.mjs reset --yes   # DEVELOPMENT ONLY: drop + migrate + seed
 *   node scripts/db/run.mjs verify    # schema report + guard tests (rollback)
 *
 * Connection: server-side DATABASE_URL only (process env wins, .env.local
 * fallback). Credentials are NEVER printed. Every command first checks the
 * connected database name and refuses anything but Consultation_db unless
 * LCSS_TARGET_DB explicitly names another database.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS_DIR = join(ROOT, "db", "migrations");
const SEED_FILE = join(ROOT, "scripts", "db", "seed.sql");
const SEED_DEV_FILE = join(ROOT, "scripts", "db", "seed-dev.sql");
const EXPECTED_DB = process.env.LCSS_TARGET_DB ?? "Consultation_db";

// --- minimal .env.local parser (no dependency; process env always wins) ---
function loadEnvLocal() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function maskHost(connectionString) {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || "5432"}`;
  } catch {
    return "<unparsable>";
  }
}

async function connect() {
  loadEnvLocal();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "DATABASE_URL is not set. Add it to .env.local:\n" +
        "  DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/Consultation_db",
    );
    process.exit(2);
  }
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();
  const { rows } = await client.query(
    "select current_database() as database, version() as version",
  );
  const database = rows[0].database;
  if (database !== EXPECTED_DB) {
    console.error(
      `Refusing to run: connected database is "${database}", expected "${EXPECTED_DB}". ` +
        `Set LCSS_TARGET_DB explicitly to override.`,
    );
    await client.end();
    process.exit(3);
  }
  console.log(`Connected to PostgreSQL (${maskHost(connectionString)})`);
  console.log(`Database: ${database}`);
  return { client, version: rows[0].version };
}

async function ensureMigrationsTable(client) {
  await client.query(
    `create table if not exists public.schema_migrations (
       filename text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function appliedSet(client) {
  await ensureMigrationsTable(client);
  const { rows } = await client.query("select filename from public.schema_migrations");
  return new Set(rows.map((r) => r.filename));
}

async function cmdStatus() {
  const { client } = await connect();
  try {
    const applied = await appliedSet(client);
    for (const file of migrationFiles()) {
      console.log(`${applied.has(file) ? "applied " : "pending "} ${file}`);
    }
  } finally {
    await client.end();
  }
}

async function cmdMigrate() {
  const { client } = await connect();
  try {
    const applied = await appliedSet(client);
    const pending = migrationFiles().filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log("Database is up to date — no pending migrations.");
      return;
    }
    for (const file of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`Applying ${file} …`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into public.schema_migrations (filename) values ($1)", [
          file,
        ]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
      console.log(`Applied ${file}.`);
    }
    console.log(`Done — ${pending.length} migration(s) applied.`);
  } finally {
    await client.end();
  }
}

async function cmdSeed() {
  const { client } = await connect();
  try {
    if (!existsSync(SEED_FILE)) {
      console.log("No seed file found — nothing to do.");
      return;
    }
    const sql = readFileSync(SEED_FILE, "utf8");
    await client.query(sql);
    console.log("Seed applied (idempotent — safe to re-run).");
  } finally {
    await client.end();
  }
}

async function cmdReset() {
  if (!process.argv.includes("--yes")) {
    console.error(
      "db:reset is DEVELOPMENT ONLY and drops all tables. Re-run with --yes to confirm.",
    );
    process.exit(4);
  }
  const { client } = await connect();
  try {
    console.log("Dropping schema public …");
    await client.query("drop schema public cascade");
    await client.query("create schema public");
    await client.query("grant all on schema public to public");
    console.log("Reset complete — re-running migrations …");
  } finally {
    await client.end();
  }
  await cmdMigrate();
  await cmdSeed();
}

async function cmdSeedDev() {
  const { client } = await connect();
  try {
    if (!existsSync(SEED_DEV_FILE)) {
      console.log("No dev seed file found — nothing to do.");
      return;
    }
    const sql = readFileSync(SEED_DEV_FILE, "utf8");
    await client.query(sql);
    console.log("Dev scenario data applied (idempotent — safe to re-run).");
  } finally {
    await client.end();
  }
}

async function cmdVerify() {
  const { client, version } = await connect();
  try {
    console.log(`PostgreSQL: ${version.split(" ").slice(0, 2).join(" ")}`);
    const tables = await client.query(
      `select tablename from pg_tables where schemaname = 'public' order by 1`,
    );
    console.log(`Tables (${tables.rows.length}):`);
    for (const r of tables.rows) console.log(`  - ${r.tablename}`);
    const counts = await client.query(
      `with public_constraints as (
         select con.contype from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace nsp on nsp.oid = rel.relnamespace
         where nsp.nspname = 'public'
       )
       select (select count(*) from public_constraints where contype = 'p') as pk,
              (select count(*) from public_constraints where contype = 'f') as fk,
              (select count(*) from public_constraints where contype = 'u') as uniq,
              (select count(*) from public_constraints where contype = 'c') as checks,
              (select count(*) from pg_indexes where schemaname = 'public') as indexes,
              (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                       join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and not t.tgisinternal) as triggers`,
    );
    console.log(`PKs: ${counts.rows[0].pk}, FKs: ${counts.rows[0].fk}, ` +
      `unique: ${counts.rows[0].uniq}, checks: ${counts.rows[0].checks}, ` +
      `indexes: ${counts.rows[0].indexes}, triggers: ${counts.rows[0].triggers}`);
    const ext = await client.query(
      `select extname from pg_extension where extname in ('pgcrypto','btree_gist','citext') order by 1`,
    );
    console.log(`Extensions: ${ext.rows.map((r) => r.extname).join(", ")}`);

    // --- guard tests inside rolled-back transactions (no data left behind) ---
    await client.query("begin");
    try {
      const u1 = await client.query(
        `insert into users (email, password_hash) values ('verify_a@example.com','x') returning id`,
      );
      const u2 = await client.query(
        `insert into users (email, password_hash) values ('verify_b@example.com','x') returning id`,
      );
      await client.query(
        `insert into profiles (id, full_name, role) values ($1,'VA','student'), ($2,'VB','lecturer')`,
        [u1.rows[0].id, u2.rows[0].id],
      );
      const st = await client.query(
        `insert into students (profile_id) values ($1) returning id`, [u1.rows[0].id],
      );
      const le = await client.query(
        `insert into lecturers (profile_id) values ($1) returning id`, [u2.rows[0].id],
      );
      const sid = st.rows[0].id;
      const lid = le.rows[0].id;

      // Appointment conflict: 10:00-10:30 then adjacent 10:30-11:00 (must pass),
      // then overlapping 10:15-10:45 (must fail with 23P01).
      await client.query(
        `insert into appointments (student_id, lecturer_id, start_datetime, end_datetime, consultation_type, status, reason)
         values ($1,$2,'2030-01-06T10:00:00+03:00','2030-01-06T10:30:00+03:00','in_person','pending','verify')`,
        [sid, lid],
      );
      await client.query(
        `insert into appointments (student_id, lecturer_id, start_datetime, end_datetime, consultation_type, status, reason)
         values ($1,$2,'2030-01-06T10:30:00+03:00','2030-01-06T11:00:00+03:00','in_person','pending','verify')`,
        [sid, lid],
      );
      console.log("Appointment adjacency 10:00-10:30 + 10:30-11:00: ALLOWED (ok)");
      let blocked = false;
      await client.query("savepoint appt_overlap");
      try {
        await client.query(
          `insert into appointments (student_id, lecturer_id, start_datetime, end_datetime, consultation_type, status, reason)
           values ($1,$2,'2030-01-06T10:15:00+03:00','2030-01-06T10:45:00+03:00','in_person','pending','verify')`,
          [sid, lid],
        );
      } catch (e) {
        await client.query("rollback to savepoint appt_overlap");
        if (e && e.code === "23P01") blocked = true;
        else throw e;
      }
      console.log(`Appointment overlap 10:00-10:30 vs 10:15-10:45: ${blocked ? "REJECTED (ok)" : "NOT REJECTED — PROBLEM"}`);

      // Availability overlap: 09:00-10:00 then adjacent 10:00-11:00 (must pass),
      // then 09:30-10:30 (must fail).
      await client.query(
        `insert into availability (lecturer_id, day_of_week, start_time, end_time) values ($1,1,'09:00','10:00')`,
        [lid],
      );
      await client.query(
        `insert into availability (lecturer_id, day_of_week, start_time, end_time) values ($1,1,'10:00','11:00')`,
        [lid],
      );
      console.log("Availability adjacency 09:00-10:00 + 10:00-11:00: ALLOWED (ok)");
      let availBlocked = false;
      await client.query("savepoint avail_overlap");
      try {
        await client.query(
          `insert into availability (lecturer_id, day_of_week, start_time, end_time) values ($1,1,'09:30','10:30')`,
          [lid],
        );
      } catch {
        await client.query("rollback to savepoint avail_overlap");
        availBlocked = true;
      }
      console.log(`Availability overlap 09:00-10:00 vs 09:30-10:30: ${availBlocked ? "REJECTED (ok)" : "NOT REJECTED — PROBLEM"}`);
      if (!blocked || !availBlocked) process.exitCode = 1;
    } finally {
      await client.query("rollback");
    }
    console.log("Guard tests rolled back — no test data left behind.");
  } finally {
    await client.end();
  }
}

const cmd = process.argv[2];
if (cmd === "migrate") await cmdMigrate();
else if (cmd === "status") await cmdStatus();
else if (cmd === "seed") await cmdSeed();
else if (cmd === "seed:dev") await cmdSeedDev();
else if (cmd === "reset") await cmdReset();
else if (cmd === "verify") await cmdVerify();
else {
  console.error("Usage: node scripts/db/run.mjs <migrate|status|seed|seed:dev|reset --yes|verify>");
  process.exit(1);
}
