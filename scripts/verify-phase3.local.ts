/* Temporary Phase-3 verification script — deleted after the run. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Load .env.local manually (tsx does not auto-load it). Secrets are never printed.
const envRaw = readFileSync(".env.local", "utf8");
for (const line of envRaw.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

import {
  dashboardPathForRole,
  isPathForRole,
  isSafeNextPath,
  mapSignInError,
  mapSignUpError,
  sanitizePublicRole,
} from "@/lib/supabase/auth";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}`, extra ?? "");
  }
}

async function main(): Promise<void> {
  // ---- A. pure helpers ----
  check(
    "dashboardPathForRole",
    dashboardPathForRole("student") === "/student/dashboard" &&
      dashboardPathForRole("lecturer") === "/lecturer/dashboard" &&
      dashboardPathForRole("admin") === "/admin/dashboard",
  );
  check(
    "isSafeNextPath",
    isSafeNextPath("/student/appointments") === true &&
      isSafeNextPath("/admin") === true &&
      isSafeNextPath("//evil.com") === false &&
      isSafeNextPath("https://evil.com") === false &&
      isSafeNextPath("") === false &&
      isSafeNextPath(null) === false &&
      isSafeNextPath("/a\\b") === false,
  );
  check(
    "isPathForRole",
    isPathForRole("/student/x", "student") === true &&
      isPathForRole("/student", "student") === true &&
      isPathForRole("/admin/dashboard", "student") === false &&
      isPathForRole("/lecturer/x", "admin") === false,
  );
  check(
    "mapSignInError",
    mapSignInError("Invalid login credentials") === "Invalid email or password." &&
      mapSignInError("Email not confirmed") ===
        "Please check your email to confirm your account." &&
      mapSignInError("something odd") === "We couldn't process your request right now.",
  );
  check(
    "mapSignUpError",
    mapSignUpError("User already registered") ===
      "Unable to create your account. Please try again." &&
      mapSignUpError("boom") === "Unable to create your account. Please try again.",
  );
  check(
    "sanitizePublicRole",
    sanitizePublicRole("lecturer") === "lecturer" &&
      sanitizePublicRole("student") === "student" &&
      sanitizePublicRole("admin") === "student" &&
      sanitizePublicRole(undefined) === "student",
  );

  // ---- B. live Supabase REST ----
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  check("env configured", url.startsWith("https://") && anon.length > 20);

  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  const anonRead = await anonClient.from("profiles").select("id").limit(1);
  check("anon cannot read profiles", (anonRead.data ?? []).length === 0);

  const accounts = [
    { email: "john.mensah@schoolemail.edu", password: "Lcss-Demo-1234", role: "student" },
    { email: "sarah.smith@university.edu", password: "Lcss-Demo-1234", role: "lecturer" },
    { email: "admin@university.edu", password: "Lcss-Demo-1234", role: "admin" },
  ] as const;

  const sessions: Record<string, { access_token: string; refresh_token: string; user: { id: string } }> = {};
  for (const a of accounts) {
    const client = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({
      email: a.email,
      password: a.password,
    });
    check(`login ${a.role}`, !error && !!data.session, error?.message);
    if (error || !data.session) continue;
    const authed = createClient(url, anon, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    });
    const prof = await authed.from("profiles").select("*").eq("id", data.user.id).single();
    check(
      `profile role is ${a.role} (DB source of truth)`,
      !prof.error && prof.data?.role === a.role,
      prof.error?.message ?? JSON.stringify(prof.data),
    );
    sessions[a.role] = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: { id: data.user.id },
    };
  }

  // Throwaway signup: proves Auth API + RLS self-insert behavior for
  // unconfirmed users (profile insert must be denied without a session).
  // NOTE: leaves one junk auth user for manual deletion (see report).
  const throwaway = `phase3-test-${Date.now()}@example.com`;
  const signupClient = createClient(url, anon, { auth: { persistSession: false } });
  const signup = await signupClient.auth.signUp({
    email: throwaway,
    password: "Temp-Check-1234",
    options: { data: { full_name: "Phase3 Test", role: "student" } },
  });
  check("throwaway signup accepted", !signup.error, signup.error?.message);
  if (!signup.error && signup.data.user) {
    console.log(
      `INFO signup session: ${signup.data.session ? "immediate (confirm OFF)" : "none (confirm ON)"} user=${signup.data.user.id.slice(0, 8)}`,
    );
    console.log(`INFO throwaway account for manual deletion: ${throwaway}`);
    const noSessionClient = createClient(url, anon, { auth: { persistSession: false } });
    const profIns = await noSessionClient.from("profiles").insert({
      id: signup.data.user.id,
      full_name: "Phase3 Test",
      email: throwaway,
      role: "student",
    });
    check(
      "profile insert without session denied (email-confirm mode)",
      signup.data.session ? true : profIns.error !== null,
      profIns.error?.message ?? "inserted (confirm OFF)",
    );
  }
  // RLS negatives as the student session.
  if (sessions.student) {
    const token = sessions.student.access_token;
    const studentClient = createClient(url, anon, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const others = await studentClient
      .from("profiles")
      .select("id")
      .eq("role", "student")
      .neq("id", sessions.student.user.id);
    check("student cannot list other students", (others.data ?? []).length === 0);
    const mine = await studentClient.from("students").select("id");
    check("student sees own student row", (mine.data ?? []).length === 1);
    const badAvail = await studentClient.from("availability").insert({
      lecturer_id: "00000000-0000-0000-0000-000000000000",
      day_of_week: 1,
      start_time: "09:00",
      end_time: "10:00",
    });
    check("student cannot insert availability", badAvail.error !== null);
  }

  // Lecturer writes own availability, then cleans up.
  if (sessions.lecturer) {
    const token = sessions.lecturer.access_token;
    const lecClient = createClient(url, anon, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const lecRow = await lecClient
      .from("lecturers")
      .select("id")
      .eq("profile_id", sessions.lecturer.user.id)
      .single();
    check("lecturer reads own lecturer row", !lecRow.error);
    if (!lecRow.error) {
      const ins = await lecClient
        .from("availability")
        .insert({
          lecturer_id: lecRow.data.id,
          day_of_week: 6,
          start_time: "08:00",
          end_time: "08:30",
        })
        .select()
        .single();
      check("lecturer inserts own availability", !ins.error, ins.error?.message);
      if (!ins.error) {
        const del = await lecClient.from("availability").delete().eq("id", ins.data.id);
        check("lecturer deletes own availability (cleanup)", !del.error, del.error?.message);
      }
    }
  }

  // ---- C. middleware via dev server ----
  const base = "http://localhost:3458";
  const ref = new URL(url).hostname.split(".")[0];
  const cookieFor = (role: string): string => {
    const s = sessions[role] as unknown as Record<string, unknown>;
    const payload = {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      user: s.user,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: "bearer",
    };
    return `sb-${ref}-auth-token=${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  };

  async function get(path: string, cookie?: string) {
    const res = await fetch(base + path, {
      redirect: "manual",
      headers: cookie ? { Cookie: cookie } : {},
    });
    const body = res.status === 200 ? await res.text() : "";
    return { status: res.status, location: res.headers.get("location") ?? "", body };
  }

  const anonStudent = await get("/student/dashboard");
  check(
    "anon /student/dashboard → /login",
    anonStudent.status === 307 && anonStudent.location.startsWith("/login?next="),
    `${anonStudent.status} ${anonStudent.location}`,
  );
  const anonLecturer = await get("/lecturer/dashboard");
  check("anon /lecturer/dashboard → /login", anonLecturer.status === 307);
  const anonAdmin = await get("/admin/dashboard");
  check("anon /admin/dashboard → /login", anonAdmin.status === 307);
  const loginPage = await get("/login");
  check(
    "anon /login is 200 with prerendered shell",
    loginPage.status === 200 && loginPage.body.includes("Welcome back"),
    loginPage.status,
  );

  if (sessions.student && sessions.lecturer && sessions.admin) {
    const sDash = await get("/student/dashboard", cookieFor("student"));
    check(
      "student /student/dashboard is 200 (not login)",
      sDash.status === 200 && !sDash.body.includes("Welcome back"),
      sDash.status,
    );
    const sAdmin = await get("/admin/dashboard", cookieFor("student"));
    check(
      "student /admin/dashboard → own dashboard",
      sAdmin.status === 307 && sAdmin.location.includes("/student/dashboard"),
      `${sAdmin.status} ${sAdmin.location}`,
    );
    const sLec = await get("/lecturer/dashboard", cookieFor("student"));
    check(
      "student /lecturer/dashboard blocked",
      sLec.status === 307 && sLec.location.includes("/student/dashboard"),
      `${sLec.status} ${sLec.location}`,
    );
    const lLec = await get("/lecturer/dashboard", cookieFor("lecturer"));
    check("lecturer /lecturer/dashboard is 200", lLec.status === 200, lLec.status);
    const lStud = await get("/student/dashboard", cookieFor("lecturer"));
    check(
      "lecturer /student/dashboard blocked",
      lStud.status === 307 && lStud.location.includes("/lecturer/dashboard"),
      `${lStud.status} ${lStud.location}`,
    );
    const aAdmin = await get("/admin/dashboard", cookieFor("admin"));
    check("admin /admin/dashboard is 200", aAdmin.status === 200, aAdmin.status);
    const aStud = await get("/student/dashboard", cookieFor("admin"));
    check(
      "admin /student/dashboard blocked",
      aStud.status === 307 && aStud.location.includes("/admin/dashboard"),
      `${aStud.status} ${aStud.location}`,
    );
    const authedLogin = await get("/login", cookieFor("student"));
    check(
      "authed /login → own dashboard",
      authedLogin.status === 307 && authedLogin.location.includes("/student/dashboard"),
      `${authedLogin.status} ${authedLogin.location}`,
    );
    const authedHome = await get("/", cookieFor("student"));
    check("authed / stays public", authedHome.status === 200, authedHome.status);
  } else {
    check("all three sessions available for middleware tests", false);
  }

  if (failures > 0) {
    console.log(`${failures} FAILURES`);
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED");
}

main().catch((e: unknown) => {
  console.error("FATAL", e);
  process.exit(1);
});
