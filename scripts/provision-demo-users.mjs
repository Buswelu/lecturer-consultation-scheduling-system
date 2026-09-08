#!/usr/bin/env node
/**
 * LCSS — demo/auth user provisioning (LOCAL-ONLY admin tool).
 *
 * Problem it solves: hand-inserting rows into `auth.users` (as the old
 * seed.sql did) is unsupported — Supabase Auth may refuse those password
 * hashes, leaving demo logins broken while public.profiles rows exist.
 * This script converges ANY state to working demo accounts through the
 * supported Admin API. It NEVER deletes anything.
 *
 * Usage (from the project root, with YOUR keys — never commit them):
 *   1. Add to .env.local (gitignored, server-side only):
 *        NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY=<service-role key>
 *      [optional] LCSS_DEMO_PASSWORD=<password, default Lcss-Demo-1234>
 *   2. Dry run (default, makes ZERO writes):
 *        node scripts/provision-demo-users.mjs
 *   3. Apply:
 *        node scripts/provision-demo-users.mjs --apply
 *
 * For every public.profiles row (source of truth for email/role/name):
 *   - auth user missing → createUser (confirmed, known password, metadata)
 *   - auth user exists  → reset password, confirm email, fix metadata
 *   - ids differ        → re-point students/lecturers/notifications/
 *                         appointment_history, then profiles.id (children
 *                         first — FKs have no ON UPDATE CASCADE)
 *
 * The service-role key stays in your local .env.local and in this process.
 * It is never bundled, never sent to the browser, never printed.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

// --- load .env.local (no dotenv dependency) --------------------------------
function loadLocalEnv() {
  let raw = "";
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    console.error("ERROR: .env.local not found. Run from the project root.");
    process.exit(2);
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadLocalEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DEMO_PASSWORD = process.env.LCSS_DEMO_PASSWORD ?? "Lcss-Demo-1234";

if (!URL || !SERVICE_KEY) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.",
  );
  process.exit(2);
}
if (SERVICE_KEY.length < 20) {
  console.error("ERROR: SUPABASE_SERVICE_ROLE_KEY looks invalid. Aborting.");
  process.exit(2);
}

console.log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);
console.log(`Project: ${URL}`);
console.log(`Demo password: ${process.env.LCSS_DEMO_PASSWORD ? "from LCSS_DEMO_PASSWORD" : "default"}`);

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`FAIL ${msg}`);
};

/** All auth users, keyed by lowercase email. */
async function listAuthUsersByEmail() {
  const byEmail = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const u of data.users) byEmail.set(u.email.toLowerCase(), u);
    if (data.users.length < 100) break;
    page += 1;
    if (page > 50) throw new Error("Too many auth users to audit safely.");
  }
  return byEmail;
}

async function main() {
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, role, full_name")
    .order("email");
  if (profilesError) throw new Error(`profiles read failed: ${profilesError.message}`);
  console.log(`Profiles in database: ${profiles.length}`);

  const authByEmail = await listAuthUsersByEmail();
  console.log(`Auth users in project: ${authByEmail.size}`);

  for (const p of profiles) {
    const email = p.email;
    const tag = `${email} [${p.role}]`;
    const existing = authByEmail.get(email.toLowerCase());

    if (!APPLY) {
      if (!existing) {
        console.log(`WOULD CREATE auth user → ${tag}`);
      } else if (existing.id !== p.id) {
        console.log(`WOULD RESET password + RE-POINT ${p.id.slice(0, 8)} → ${existing.id.slice(0, 8)} → ${tag}`);
      } else {
        console.log(`WOULD RESET password (ids already match) → ${tag}`);
      }
      continue;
    }

    let authId;
    if (!existing) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: p.full_name, role: p.role },
      });
      if (error || !data.user) {
        fail(`createUser ${tag}: ${error?.message ?? "no user returned"}`);
        continue;
      }
      authId = data.user.id;
      console.log(`CREATED auth user → ${tag}`);
    } else {
      authId = existing.id;
      const { error } = await supabase.auth.admin.updateUserById(authId, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: p.full_name, role: p.role },
      });
      if (error) {
        fail(`updateUser ${tag}: ${error.message}`);
        continue;
      }
      console.log(`RESET password + confirmed → ${tag}`);
    }

    // Re-point application rows at the real auth id (children before
    // parent — FKs cascade on delete but not on update).
    if (authId !== p.id) {
      const repoints = [
        ["students", "profile_id"],
        ["lecturers", "profile_id"],
        ["notifications", "user_id"],
        ["appointment_history", "changed_by"],
      ];
      for (const [table, column] of repoints) {
        const { error } = await supabase
          .from(table)
          .update({ [column]: authId })
          .eq(column, p.id);
        if (error) {
          fail(`re-point ${table}.${column} ${tag}: ${error.message}`);
        }
      }
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ id: authId })
        .eq("id", p.id);
      if (profileError) {
        fail(`re-point profiles.id ${tag}: ${profileError.message}`);
        continue;
      }
      console.log(`RE-POINTED profile ${p.id.slice(0, 8)} → ${authId.slice(0, 8)} → ${tag}`);
    }
  }

  if (failures > 0) {
    console.error(`${failures} FAILURES`);
    process.exit(1);
  }
  console.log(
    APPLY
      ? "DONE. Demo accounts can now sign in with the demo password."
      : "DRY-RUN complete. Re-run with --apply to perform the above.",
  );
}

main().catch((e) => {
  console.error("FATAL", e instanceof Error ? e.message : e);
  process.exit(1);
});
