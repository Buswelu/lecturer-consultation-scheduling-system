# LCSS — PostgreSQL Migration Plan (schema/architecture audit)

> Stage: audit/design ONLY. Nothing has been migrated. Supabase is still the
> live backend; no tables created, no auth changed, no UI changed.
> Companion snapshot: `docs/MIGRATION-SNAPSHOT.md` (2026-10-05).

## 1. Current architecture

```text
Browser (Next.js App Router pages/components)
  ↓  browser Supabase client (anon key, RLS-enforced)
Supabase: PostgreSQL + Auth + RLS + triggers
  ↑  server Supabase clients (cookie session / service-role bypass)
Next.js Server Components / Route Handlers (api/auth/*) / proxy.ts
```

Services (`src/lib/services/*`) call `getSupabase()` when
`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set,
otherwise the in-memory `src/lib/mock-data/*` fallback. Auth session refresh
and route protection live in `src/proxy.ts` → `lib/supabase/middleware.ts`.

## 2. Current schema (all 6 migrations read)

12 tables, UUID PKs (`gen_random_uuid()`), `timestamptz`, snake_case.

| Table | Purpose | PK | FKs | Unique | Checks | Indexes | Triggers | RLS policies |
|---|---|---|---|---|---|---|---|---|
| `profiles` | One row per auth user; role source of truth | `id uuid` | `id → auth.users.id CASCADE` | — | `role ∈ student,lecturer,admin` | `profiles_role_idx` | `set_updated_at`, `prevent_role_escalation` | select_own, select_directory (lecturer/admin visible), select_own_students, insert_own (self, student/lecturer only), update_own, admin_all |
| `students` | Student detail | `id uuid` | `profile_id → profiles UNIQUE CASCADE`, `department_id → departments SET NULL` | `profile_id`, `student_number` | `year_of_study ≥ 1` | profile, department | `set_updated_at` | select_own, select_counterparty (lecturer via appointment), insert/update_own, admin_all |
| `lecturers` | Lecturer detail | `id uuid` | `profile_id → profiles UNIQUE CASCADE`, `department_id → departments SET NULL` | `profile_id`, `staff_number` | — | profile, department | `set_updated_at` | select_all (public directory), insert/update_own, admin_all |
| `departments` | Departments | `id uuid` | — | `name`, `code` | — | — | `set_updated_at` | select_all, admin_all |
| `courses` | Courses | `id uuid` | `department_id → departments SET NULL` | `code` | — | department | `set_updated_at` | select_all, admin_all + lecturer insert/update_own (migration 5) |
| `lecturer_courses` | Lecturer↔course assignments | `id uuid` | `lecturer_id → lecturers CASCADE`, `course_id → courses CASCADE` | `(lecturer_id, course_id)` | — | lecturer, course | — | select_all, admin_all + lecturer insert/delete_own (migration 5) |
| `availability` | Recurring weekly rules (`day_of_week` 0–6 = PG `EXTRACT(DOW)`, `start/end_time time`) | `id uuid` | `lecturer_id → lecturers CASCADE` | — | `0–6`, `start < end` | lecturer, day | `set_updated_at`, `prevent_availability_overlap` | select_all, write_own (owner or admin) |
| `availability_exceptions` | One-off unavailable ranges (`timestamptz`) | `id uuid` | `lecturer_id → lecturers CASCADE` | — | `start < end` | lecturer, start | `set_updated_at` | select_all, write_own |
| `appointments` | Bookings (`timestamptz` ranges, `consultation_type`, 7 statuses) | `id uuid` | `student_id → students`, `lecturer_id → lecturers`, `course_id → courses SET NULL` | — | `start < end`, status/type enums | student, lecturer, course, start, status | `set_updated_at`, `enforce_appointment_update_rules`, `log_appointment_history`, `notify_appointment_event` + GiST exclusion `appointments_no_double_booking` | select_parties, insert_own (own student, `pending`), update_parties, delete_admin |
| `appointment_history` | Immutable audit trail | `id uuid` | `appointment_id → appointments CASCADE`, `changed_by → profiles` | — | — | appointment | (written by trigger) | select_parties only (default-deny writes) |
| `notifications` | In-app notifications (`user_id` = profile id) | `id uuid` | `user_id → profiles CASCADE`, `appointment_id → appointments SET NULL` | — | 7-type check | user, is_read | (written by trigger/service_role) | select_own (+admin), insert_own_or_admin, update_own, delete_admin |
| `auth_rate_limits` | Login/recovery/register counters (UNTRACKED migration `20260909000000`) | `id uuid` | — | `key` | `attempts ≥ 0` | blocked_until, last_attempt | `set_updated_at` | RLS enabled, NO policies (default-deny; service_role only) |

Helper functions (migration 1): `set_updated_at`, `current_user_role`,
`is_admin`, `own_student_id`, `own_lecturer_id` (all `SECURITY DEFINER`),
`prevent_role_escalation`, `log_appointment_history`,
`enforce_appointment_update_rules` (+ reschedule extension in migration 4
functionally = migration `..._000003`), `notify_appointment_event`,
`prevent_availability_overlap`.

Seed (`supabase/seed.sql`): inserts demo rows incl. direct `auth.users`
inserts with `crypt()` hashes (password `Lcss-Demo-1234`) — must be replaced
by app-level provisioning (see §6).

## 3. Supabase dependencies and replacements

| Supabase feature | Where | Replacement |
|---|---|---|
| `auth.users` + `profiles.id → auth.users.id` | schema, seed, all auth flows | New `users` table (§6); `profiles.id → users.id CASCADE` |
| `auth.uid()` in helpers/triggers/policies | 4 helpers, 3 triggers, ~30 policies | Remove; pass actor id as trigger argument or do checks in Node services. `SECURITY DEFINER` itself is plain PG and stays |
| RLS policies (all tables) | migration 2 + 5 | Server-side ownership checks in services/route handlers (§7); run app with a single least-privilege DB role, no RLS |
| Service-role bypass | `server.ts createServiceClient`, rate-limit store, seed | Server-only `pg` pool; privileged ops are just normal SQL server-side |
| `supabase.auth.*` (signUp/signIn/signOut/reset/update/verifyOtp/getUser) | `auth.ts`, 3 API routes, `/auth/confirm`, 4 pages | App-owned auth: Argon2id + `sessions` table + HTTP-only cookies (§6) |
| `pgcrypto` (`gen_random_uuid`, seed `crypt`) | schema + seed | `pgcrypto` is stock PG — keep `gen_random_uuid()`; password hashing moves to Node (Argon2id), never `crypt()` |
| `btree_gist` (exclusion constraint) | migration 4 | Stock PG contrib module — `CREATE EXTENSION btree_gist` on self-managed DB, constraint reused verbatim |
| Email links (confirmation/recovery) | `/auth/confirm`, `verifyOtp` | App-signed tokens in `email_verifications` / `password_resets` tables + `GET /auth/confirm`, `POST /api/auth/reset-password` |
| Storage | none found | n/a (`avatar_url` is a plain text column) |
| Realtime | none found (only transitive dep) | n/a (unread counts stay a SQL query) |

## 4. Target PostgreSQL architecture

```text
Browser
  ↓ fetch only (no DB driver, no secrets)
Next.js pages/components
  ↓ Route Handlers / Server Actions (Zod validation)
Application service layer (ownership + business rules)
  ↓ pg Pool (server-only DATABASE_URL)
Self-managed PostgreSQL (constraints/triggers, no RLS)
```

`src/lib/db/`: `pool.ts` (singleton `pg.Pool`), `query.ts` (parameterized
helper), `transaction.ts`. Repositories under `src/lib/db/repositories/`
(one per aggregate) consumed by existing `src/lib/services/*` signatures
where possible. Cookies: `HttpOnly; Secure; SameSite=Lax` session cookie;
browser holds no token payload.

## 5. Target schema (design, not implemented)

```sql
-- auth (new)
users(id uuid PK, email citext UNIQUE NOT NULL, password_hash text NOT NULL,
      email_verified_at timestamptz, created_at, updated_at,
      last_login_at timestamptz, is_active bool DEFAULT true);
sessions(id uuid PK, user_id → users CASCADE, token_hash text UNIQUE NOT NULL,
      expires_at, created_at, last_seen_at);
password_resets(id uuid PK, user_id → users CASCADE, token_hash UNIQUE NOT NULL,
      expires_at, used_at, created_at);
email_verifications(user_id → users CASCADE, token_hash UNIQUE NOT NULL,
      expires_at, created_at);
-- application (ported 1:1, FK retargeted)
profiles(id uuid PK → users.id CASCADE, full_name, email, phone, avatar_url,
      role check, created_at, updated_at);
students / lecturers / departments / courses / lecturer_courses /
availability / availability_exceptions / appointments /
appointment_history / notifications — same columns/constraints/indexes as §2,
      plus: appointments keeps GiST exclusion; availability keeps overlap trigger.
auth_rate_limits(key text PK — or keep uuid PK + unique key; §11 —
      attempts, first_attempt_at, last_attempt_at, blocked_until,
      created_at, updated_at) WITH periodic DELETE cleanup (§11).
```

Keep: UUID PKs, all FKs, unique/check constraints, all indexes,
`Africa/Dar_es_Salaam` formatting in trigger messages, `[start, end)`
half-open semantics, blocking-status set (`pending/approved/rescheduled`).

## 6. Authentication redesign (not implemented)

- Identity: `users.id` (uuid) → `profiles.id` (same value, `CASCADE`) →
  `students.profile_id` / `lecturers.profile_id`. One login identity, one
  profile, at most one detail row; admins have profile only.
- Email uniqueness: `citext UNIQUE` on `users.email`, normalized
  (trim+lowercase via existing `normalize-email.ts`) before compare/insert.
- Passwords: Argon2id in Node (`argon2` lib, `bcryptjs` fallback on Windows
  build issues); only `password_hash` stored; login uses constant-time verify,
  then generic error (never distinguish bad-email vs bad-password).
- Sessions: random 256-bit token; DB stores `SHA-256(token)` + expiry;
  cookie carries raw token. `last_seen_at` enables idle expiry; logout
  deletes row; password change wipes all user sessions.
- Roles: stored ONLY in `profiles.role`; `sanitizePublicRole` + new
  `prevent_role_escalation` equivalent in service layer (admin-only role
  updates); session resolves role from DB per request, never from cookie.
- Verification/reset: single-use hashed tokens with expiry; dev seed creates
  users through the register service (or provisioning script), never raw
  `users` inserts — replaces `seed.sql`'s `auth.users` block.
- Deletion: `users DELETE CASCADE` → sessions/tokens, profile, detail rows;
  appointments referencing deleted students/lecturers keep current FK behavior
  (review: `students`/`lecturers` FK from appointments has no CASCADE today).

## 7. Authorization redesign (RLS → server rules)

Every handler resolves `session → profiles.role + own student/lecturer id`
via `requireUser()/requireRole()/requireAnyRole()` and enforces:

| RLS policy | Server rule |
|---|---|
| `profiles_select_own/directory/own_students` | Self read; lecturer/admin directory readable when authenticated; student profile visible to lecturer sharing an appointment; else admin |
| `profiles_insert_own` (self, student/lecturer) | Registration service creates `users+profiles+detail` atomically; role allow-listed |
| `profiles_update_own` + escalation trigger | Self may edit non-role fields; role change requires admin |
| `students_select_own/counterparty`, `insert/update_own` | Owner + counterparty-lecturer + admin read; owner/admin write |
| `lecturers_select_all`, `insert/update_own` | Authenticated read; owner/admin write |
| `departments/courses/lecturer_courses _select_all`, `*_admin_all` | Authenticated read; admin write, plus lecturer course create/self-assign (migration 5 → same rules in service) |
| `availability*_select_all`, `write_own` | Authenticated read; owning lecturer/admin write |
| `appointments_select/insert/update_parties`, `delete_admin` + update-rule trigger | Parties/admin read; student inserts own `pending`; student cancel-own only; lecturer status/reschedule-own only; admin all; delete admin only |
| `notifications_select/insert/update_own`, `delete_admin` | Owner read; owner mark-read; system writes via services (replacing trigger); delete admin |
| `appointment_history_select_parties` (write-deny) | Parties/admin read; writes only from service layer inside appointment transactions |
| `auth_rate_limits` (no policies, service_role) | No route exposes it; only server limiter touches the table |

## 8. Appointment protection (reusable verbatim, minus `auth.uid()`)

- Constraint: partial GiST exclusion `appointments_no_double_booking` on
  `(lecturer_id =, tstzrange(start,end) &&)` `WHERE status IN
  (pending,approved,rescheduled)` — pure PG, reuse as-is after
  `CREATE EXTENSION btree_gist`. Race behavior: exactly one concurrent
  insert wins; other gets `23P01`, mapped to friendly conflict (§10 services).
- Statuses: `pending/approved/rejected/cancelled/completed/rescheduled/no_show`
  (`no-show` in UI); transitions per `APPOINTMENT_TRANSITIONS` +
  `enforce_appointment_update_rules` (student: cancel-own; lecturer:
  status/reschedule-own with retime only on `→rescheduled` from live states;
  admin: all).
- History: `log_appointment_history` — replace `auth.uid()` with explicit
  actor (e.g. `SET LOCAL app.actor` or a `changed_by` passed from the service
  transaction); keep retime-note + EAT formatting.
- Notifications: `notify_appointment_event` depends on `auth.uid()` as actor;
  simplest replacement is service-layer notification writes inside the same
  transaction (trigger dropped), preserving message texts/timing.
- Cancellation/rescheduling rules otherwise unchanged (future-slot check,
  `assertSlotAvailable` pre-check + exclusion backstop).

## 9. Availability architecture (unchanged semantics)

- Weekly rules: `(lecturer_id, day_of_week 0–6, start/end_time, is_active)`,
  strict-overlap trigger (adjacent allowed), service pre-check
  `findOverlappingWindow` kept for friendly errors.
- Exceptions: one-off `[start,end)` `timestamptz` blocks (leave/meetings,
  full-day closures as 00:00–24:00 ranges); no schema change.
- Slot generation stays in `scheduling/slots.ts` + `datetime.ts` (EAT wall
  clock → UTC `wallToISO`/`combineDatetime`); DB stores UTC; blocking =
  exceptions ∪ active appointments (`pending/approved/rescheduled`) ∪ past.
- Breaks/unavailable dates: current schema has no break columns (mappers
  default 30-min/no-breaks); any break support is a future additive migration,
  not this plan.

## 10. Notification architecture

Table unchanged. Writes move from `notify_appointment_event` trigger to the
appointment services (same events: request submitted/approved/rejected/
cancelled/rescheduled/completed/no-show + lecturer new-request copy).
Reads: `WHERE user_id = <session profile> ORDER BY created_at DESC`,
unread count `WHERE is_read = false`. No email (out of scope, as today).

## 11. Rate limiting (PostgreSQL-backed)

- Current: `auth_rate_limits(key UNIQUE, attempts, first_attempt_at,
  last_attempt_at, blocked_until, …)`; pure logic in `rate-limit.ts`
  (`evaluateLimit/checkRateLimit/recordFailure/recordSuccess`); store is
  `PostgresRateLimitStore` via Supabase service client, else in-memory
  fallback; policies: login 5/300s/900s, recovery 3/3600s/3600s, register
  5/3600s/3600s (env-overridable, `auth-rate-limit-config.ts`); enforced in
  the 3 API routes before auth runs.
- Target: same table (fresh migration; consider `key text PRIMARY KEY`
  instead of surrogate uuid — identical semantics, one less index), same pure
  logic untouched, store reimplemented on `pg` pool (`SELECT/UPSERT/DELETE`
  by key); lazy delete on check + periodic
  `DELETE WHERE blocked_until < now() AND last_attempt_at < now() - 2h`.
  No passwords/tokens stored. Enforcement points identical, extended to new
  `logout/me/reset` where sensible.

## 12. Environment variables (no files changed in this stage)

Disappear: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`.
New (server-only, never `NEXT_PUBLIC_`): `DATABASE_URL`,
`SESSION_SECRET`, `PASSWORD_RESET_SECRET`, `APP_URL`
(e.g. `http://localhost:3000`), existing `AUTH_LOGIN/RECOVERY/REGISTER_*`
kept as-is.
`NEXT_PUBLIC_SITE_URL`: only used server-side (register/recovery/confirm
routes) to absolutize email links; it must NOT remain `NEXT_PUBLIC_` (nothing
client-side reads it). Rename to `APP_URL`, server-only; keep behavior
(relative fallback when unset). Do not edit `.env*` until implementation.

## 13. Migration order (dependency-driven)

```text
db/migrations/
  001_extensions.sql      pgcrypto, btree_gist, citext (no deps)
  002_users_auth.sql      users, sessions, password_resets,
                          email_verifications (deps: 001)
  003_profiles.sql        profiles → users (deps: 002)
  004_academic.sql        departments, students, lecturers, courses,
                          lecturer_courses (deps: 003)
  005_availability.sql    availability + exceptions + overlap trigger (deps: 004)
  006_appointments.sql    appointments + exclusion + update-rules +
                          history triggers (deps: 004; notify trigger DROPPED,
                          replaced by service writes)
  007_history_notifications.sql  appointment_history, notifications (deps: 003, 006)
  008_rate_limits.sql     auth_rate_limits (deps: none except 001; last, standalone)
  009_seed_dev.sql        dev data via app provisioning, never raw users inserts
```

Each migration records itself in a `schema_migrations` table; runner must
support `migrate / status / seed / reset` on Windows + Linux without `psql`.

## 14. Risks

1. `auth.users` FK re-homing — every `profiles.id` consumer must move together.
2. RLS removal leaves a window with no enforcement — services must land with
   checks before cutover; audit each `supabase.from()` call site.
3. `auth.uid()` inside triggers — history/notify triggers silently skip or
   misattribute without an actor; decide explicit-actor mechanism first.
4. Seed `auth.users` block is Supabase-only — dev login breaks until
   provisioning script exists.
5. Untracked `src/app/api/` + `src/lib/security/` + rate-limit migration —
   commit before implementation.
6. `pg` native vs `argon2` native builds on Windows — verify early, keep
   `bcryptjs` fallback ready.
7. `npm run lint` slow (~5 min Windows) — factor into CI/verification.

## 15. Rollback strategy

- Pre-migration: commit everything; `pg_dump` any shared database; keep this
  plan + snapshot docs.
- During implementation: Supabase code/files/env remain untouched; new
  `db/`, `lib/db/`, `lib/auth/` code is additive; feature-flag live/mock per
  service (existing `IS_MOCK` pattern) so any service can fall back.
- Cutover is one commit (env swap + remove Supabase); rollback = revert that
  commit, restore `DATABASE_URL`-era dump if needed. No data migration from
  Supabase cloud is in scope (fresh self-managed DB + seed).

## 16. Recommended implementation order

1. Commit current tree; add `pg` + `argon2`; `lib/db` pool + migration runner.
2. Migrations `001–003` + `008` on local PG (pool + rate-limit store first —
   de-risks infra).
3. Auth: `users/sessions/tokens` + `/api/auth/*` + `proxy.ts` + auth pages.
4. Services → repositories one aggregate at a time
   (departments → courses → lecturers/students → availability →
   appointments → notifications → users), pages follow each service.
5. Cutover: remove Supabase deps/files/env, docs, backup/restore runbook.
