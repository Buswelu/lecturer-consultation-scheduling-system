/**
 * LCSS — development account provisioning (DEV ONLY, never production).
 *
 * Creates users with system-generated identifiers + a one-time random
 * password that is printed ONCE. No passwords are hardcoded or stored
 * anywhere except the Argon2id hash in Consultation_db.
 *
 * Usage:
 *   node scripts/db/provision.mjs <student|lecturer|admin> <email> "<Full Name>"
 *
 * Example:
 *   node scripts/db/provision.mjs admin admin@university.edu "System Admin"
 *
 * Refuses any database but Consultation_db (unless LCSS_TARGET_DB overrides).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import pg from "pg";
import argon2 from "argon2";

const { Client } = pg;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXPECTED_DB = process.env.LCSS_TARGET_DB ?? "Consultation_db";

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

const [role, email, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ").trim();
if (!["student", "lecturer", "admin"].includes(role) || !email?.includes("@") || fullName.length < 3) {
  console.error('Usage: node scripts/db/provision.mjs <student|lecturer|admin> <email> "<Full Name>"');
  process.exit(1);
}

const seqFor = { student: "student", lecturer: "lecturer", admin: "admin" }[role];
const password = randomBytes(12).toString("base64url");

loadEnvLocal();
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows: dbRows } = await client.query("select current_database() as database");
if (dbRows[0].database !== EXPECTED_DB) {
  console.error(`Refusing: connected to "${dbRows[0].database}", expected "${EXPECTED_DB}".`);
  await client.end();
  process.exit(3);
}

await client.query("begin");
try {
  const seqRes = await client.query(
    `select nextval('public.${seqFor}_number_seq') as nextval`,
  );
  const seq = Number.parseInt(seqRes.rows[0].nextval, 10);
  const year = new Date().getFullYear();
  const padded = String(seq).padStart(4, "0");
  const username =
    role === "admin" ? `ADM-${padded}` : `${role === "student" ? "STU" : "LEC"}-${year}-${padded}`;
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const normalizedEmail = email.trim().toLowerCase();
  const userRes = await client.query(
    "insert into public.users (email, username, password_hash, email_verified_at) values ($1, $2, $3, now()) returning id",
    [normalizedEmail, username, passwordHash],
  );
  const userId = userRes.rows[0].id;
  await client.query(
    "insert into public.profiles (id, full_name, email, role) values ($1, $2, $3, $4)",
    [userId, fullName, normalizedEmail, role],
  );
  if (role === "student") {
    await client.query(
      "insert into public.students (profile_id, student_number) values ($1, $2)",
      [userId, username],
    );
  } else if (role === "lecturer") {
    await client.query(
      "insert into public.lecturers (profile_id, staff_number) values ($1, $2)",
      [userId, username],
    );
  }
  await client.query("commit");
  console.log(`Provisioned ${role}:`);
  console.log(`  identifier: ${username}`);
  console.log(`  email:      ${normalizedEmail}`);
  console.log(`  password:   ${password}   (shown once — store it safely)`);
} catch (err) {
  await client.query("rollback");
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("duplicate key")) {
    console.error("An account with that email or identifier already exists.");
  } else {
    console.error(`Provisioning failed: ${message}`);
  }
  process.exit(1);
} finally {
  await client.end();
}
