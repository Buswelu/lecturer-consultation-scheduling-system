/**
 * LCSS — production-readiness checks (read-only, never prints secrets).
 *
 * Usage: npm run doctor
 *
 * Verifies environment configuration + database reachability + migration
 * state without exposing DATABASE_URL, SESSION_SECRET, or any credential.
 * Exit 0 = ready, 1 = problems found (each printed as FAIL/WARN).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "node:net";
import pg from "pg";

const { Client } = pg;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let failures = 0;
let warnings = 0;

function pass(label) {
  console.log(`  PASS  ${label}`);
}

function fail(label, hint) {
  failures += 1;
  console.log(`  FAIL  ${label}${hint ? ` — ${hint}` : ""}`);
}

function warn(label, hint) {
  warnings += 1;
  console.log(`  WARN  ${label}${hint ? ` — ${hint}` : ""}`);
}

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

function parseDatabaseUrl(raw) {
  try {
    const url = new URL(raw);
    return {
      host: url.hostname || "localhost",
      port: Number(url.port) || 5432,
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    };
  } catch {
    return null;
  }
}

function tcpReachable(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(5000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

loadEnvLocal();

// --- 1. environment -------------------------------------------------------
console.log("Environment:");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  fail("DATABASE_URL is set", "add it to .env.local (never commit it)");
} else {
  pass("DATABASE_URL is set");
}

const secret = process.env.SESSION_SECRET ?? "";
if (secret.length >= 32) {
  pass("SESSION_SECRET length >= 32");
} else {
  fail(
    "SESSION_SECRET length >= 32",
    "generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

if (process.env.NODE_ENV === "production" && process.env.LCSS_DEV_TOKENS === "1") {
  fail("LCSS_DEV_TOKENS disabled in production", "dev tokens would leak reset links");
} else if (process.env.LCSS_DEV_TOKENS === "1") {
  warn("LCSS_DEV_TOKENS=1 enabled", "local development only — never production");
} else {
  pass("LCSS_DEV_TOKENS off");
}

const gitignore = join(ROOT, ".gitignore");
const gitignoreText = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
if (gitignoreText.includes(".env.local") || gitignoreText.split("\n").some((l) => l.trim() === ".env*")) {
  pass(".env.local is git-ignored");
} else {
  fail(".env.local is git-ignored", "secrets could be committed");
}

const forbidden = ["NEXT_PUBLIC_DATABASE_URL", "NEXT_PUBLIC_SESSION_SECRET"];
const leaked = forbidden.filter((k) => process.env[k]);
if (leaked.length === 0) {
  pass("no NEXT_PUBLIC_* secrets");
} else {
  fail(`no NEXT_PUBLIC_* secrets`, `found: ${leaked.join(", ")}`);
}

// --- 2. database ----------------------------------------------------------
console.log("Database:");
const parsed = databaseUrl ? parseDatabaseUrl(databaseUrl) : null;
if (!parsed) {
  fail("DATABASE_URL parses", "expected postgresql://user:****@host:port/db");
  console.log(`\n${failures} failure(s), ${warnings} warning(s).`);
  process.exit(1);
}

if (await tcpReachable(parsed.host, parsed.port)) {
  pass(`TCP reachable (${parsed.host}:${parsed.port})`);
} else {
  fail(`TCP reachable (${parsed.host}:${parsed.port})`, "is PostgreSQL running?");
  console.log(`\n${failures} failure(s), ${warnings} warning(s).`);
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
} catch {
  fail("PostgreSQL authentication", "check user/password in DATABASE_URL");
  console.log(`\n${failures} failure(s), ${warnings} warning(s).`);
  process.exit(1);
}
try {
  const { rows } = await client.query(
    "select current_database() as database, version() as version",
  );
  pass(`connected (database: ${rows[0].database})`);
  console.log(`        ${rows[0].version.split(" ").slice(0, 2).join(" ")}`);

  const ext = await client.query(
    "select extname from pg_extension where extname in ('pgcrypto','btree_gist','citext')",
  );
  const have = new Set(ext.rows.map((r) => r.extname));
  if (["pgcrypto", "btree_gist", "citext"].every((e) => have.has(e))) {
    pass("extensions pgcrypto, btree_gist, citext");
  } else {
    fail("extensions pgcrypto, btree_gist, citext", "run: npm run db:migrate");
  }

  const tables = await client.query(
    "select count(*) as n from pg_tables where schemaname = 'public'",
  );
  if (Number(tables.rows[0].n) >= 16) {
    pass(`application tables present (${tables.rows[0].n})`);
  } else {
    fail("application tables present", "run: npm run db:migrate");
  }

  const mig = await client.query(
    "select count(*) as applied from public.schema_migrations",
  ).catch(() => ({ rows: [{ applied: "?" }] }));
  console.log(`        migrations applied: ${mig.rows[0].applied}`);
} finally {
  await client.end();
}

console.log(`\n${failures} failure(s), ${warnings} warning(s).`);
process.exit(failures > 0 ? 1 : 0);
