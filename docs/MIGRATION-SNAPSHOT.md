# LCSS — Migration Safety Snapshot (Supabase baseline, read-only)

> Snapshot date (UTC): 2026-10-05
> Purpose: record the pre-migration state before moving from Supabase to
> self-managed PostgreSQL. No Supabase code, schema, auth, env, or UI was
> modified in this stage. Only this file (`docs/MIGRATION-SNAPSHOT.md`) was created.

## 1. Git status

Branch: `main` (tracks `origin/main`).

Working tree at snapshot time (from `git status --short`):

```text
 M .env.example
 M src/app/forgot-password/page.tsx
 M src/app/login/page.tsx
 M src/app/register/page.tsx
 M src/lib/supabase/database.types.ts
?? .freebuff/
?? src/app/api/
?? src/lib/security/
?? supabase/migrations/20260909000000_auth_rate_limits.sql
```

Recent history (`git log --oneline -5`):

```text
4c25f17 addding the course page
d29f83c backend and supabse features
778a149 complete frontend
```

Note: `src/app/api/` and `src/lib/security/` are untracked — the server-side
auth routes + rate limiter exist on disk but are not committed.

## 2. Current architecture

```text
Browser (React 19 + Next.js 16 App Router + Tailwind + shadcn/ui)
  ↓  browser Supabase client (anon key, RLS-enforced)
Supabase (PostgreSQL + Auth + RLS policies + triggers)
  ↑  server Supabase clients (cookie session / service-role bypass)
Next.js Server Components / Route Handlers / proxy.ts
```

- UI never touches SQL directly; all data goes through
  `src/lib/services/*`, which call the browser Supabase client
  (`getSupabase()`) when env vars are present, else the in-memory
  `src/lib/mock-data/*` fallback (`IS_MOCK = false` in every service).
- Auth session refresh + route protection live in `src/proxy.ts` →
  `src/lib/supabase/middleware.ts` (`handleMiddleware`).
- Server-side auth endpoints in `src/app/api/auth/*` enforce application
  rate limits first, then delegate to Supabase Auth via `createClient()`.

## 3. Current frontend routes (37, from `next build` output)

Public: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`.

Student: `/student/dashboard`, `/student/lecturers`,
`/student/lecturers/[id]`, `/student/appointments`,
`/student/appointments/new`, `/student/appointments/[id]`,
`/student/calendar`, `/student/notifications`, `/student/profile`,
`/student/settings`.

Lecturer: `/lecturer/dashboard`, `/lecturer/appointments`,
`/lecturer/appointments/[id]`, `/lecturer/availability`,
`/lecturer/calendar`, `/lecturer/courses`, `/lecturer/notifications`,
`/lecturer/profile`, `/lecturer/settings`.

Admin: `/admin/dashboard`, `/admin/users`, `/admin/students`,
`/admin/lecturers`, `/admin/departments`, `/admin/courses`,
`/admin/appointments`, `/admin/appointments/[id]`, `/admin/reports`,
`/admin/settings`.

API: `/api/auth/login`, `/api/auth/recovery`, `/api/auth/register`
(all `POST`, `runtime = "nodejs"`), plus `/auth/confirm` (GET, email-link flow).

## 4. Current backend / service structure

- `src/lib/supabase/`: `client.ts`, `server.ts`, `middleware.ts`, `auth.ts`,
  `access.ts` (server-only), `mappers.ts`, `database.types.ts`.
- `src/lib/services/`: `appointments.ts` (925 lines, booking + transitions),
  `availability.ts`, `courses.ts`, `departments.ts`, `lecturers.ts`,
  `students.ts`, `users.ts`, `notifications.ts`, plus
  `appointments.test.ts`.
- `src/lib/security/`: `rate-limit.ts` (Memory + Postgres stores, pure
  `evaluateLimit`/`checkRateLimit`/`recordFailure`/`recordSuccess`),
  `auth-rate-limit-config.ts`, `get-client-ip.ts`, `normalize-email.ts`,
  `auth-log.ts`, plus `rate-limit.test.ts`, `auth-security.test.ts`.
- `src/lib/scheduling/`: `slots.ts`, `datetime.ts`, `config.ts`
  (institution timezone `Africa/Dar_es_Salaam`, half-open `[start, end)`),
  plus `slots.test.ts`, `datetime.test.ts`.
- `src/hooks/useSessionIds.ts`: resolves current student/lecturer ids client-side.

## 5. Supabase dependencies

- `package.json`: `@supabase/ssr@^0.12.6`, `@supabase/supabase-js@^2.115.0`.
- 352 case-insensitive `supabase` references under `src/` (code + comments).
- Direct `@supabase/*` imports: `lib/supabase/client.ts`,
  `lib/supabase/server.ts`, `lib/supabase/middleware.ts`,
  `app/auth/confirm/route.ts`.
- `lib/supabase/*` consumers: all 8 service files, 3 API routes,
  `login`/`register`/`forgot-password`/`reset-password` pages, lecturer +
  student dashboard/calendar/availability/appointment pages, navbar,
  user-menu, `useSessionIds`, `proxy.ts`, `rate-limit.ts` (service client).
- No Storage (`.storage`) and no Realtime (`channel`/`subscribe`) usage found.
- `supabase/` folder: `README.md`, `seed.sql`, `diagnostics-auth-audit.sql`,
  `fix-profile-names.sql`, `migrations/` (6 files).

## 6. Database tables (from `20260908000000_lcss_schema.sql`)

`profiles` (`id uuid PK → auth.users.id`, `full_name`, `email`, `phone`,
`avatar_url`, `role ∈ student|lecturer|admin`), `departments`,
`students` (`profile_id unique → profiles`, `student_number unique`,
`programme`, `department_id → departments, SET NULL`, `year_of_study`),
`lecturers` (`profile_id unique → profiles`, `staff_number unique`,
`department_id → departments, SET NULL`, `office`, `bio`),
`courses` (`code unique`, `name`, `department_id → departments, SET NULL`,
`is_active`), `lecturer_courses` (`lecturer_id → lecturers CASCADE`,
`course_id → courses CASCADE`, unique pair), `availability`
(`lecturer_id → lecturers CASCADE`, `day_of_week 0–6`,
`start_time < end_time`), `availability_exceptions`
(`lecturer_id → lecturers CASCADE`, `start_datetime < end_datetime`),
`appointments` (`student_id → students`, `lecturer_id → lecturers`,
`course_id → courses, SET NULL`, `consultation_type ∈ in_person|online`,
`status ∈ pending|approved|rejected|cancelled|completed|rescheduled|no_show`,
`reason`, `notes`, `location`, `meeting_link`, `rejection_reason`),
`notifications` (`user_id → profiles CASCADE`, 7-type check,
`is_read`, `appointment_id → appointments, SET NULL`),
`appointment_history` (`appointment_id → appointments CASCADE`,
`changed_by → profiles`, `old/new_status`, `action`, `notes`),
`auth_rate_limits` (`key PK`, counters + `blocked_until`, see §7).

Plus: per-table `updated_at` triggers, `prevent_role_escalation`,
`log_appointment_history`, `enforce_appointment_update_rules`,
`prevent_availability_overlap`, GiST exclusion anti-double-booking
(`..._000003_appointment_booking.sql:49`), `notify_appointment_event`.

## 7. Migrations (6 files, `supabase/migrations/`)

1. `20260908000000_lcss_schema.sql` — tables, indexes, base triggers.
2. `20260908000001_lcss_rls.sql` — full RLS policy set (per-role select/insert/update/delete).
3. `20260908000002_availability_overlap.sql` — overlap trigger.
4. `20260908000003_appointment_booking.sql` — exclusion constraint, update rules, history + notify triggers.
5. `20260908000004_lecturer_course_creation.sql` — lecturer course policies.
6. `20260909000000_auth_rate_limits.sql` — `auth_rate_limits` table (UNTRACKED in git).

## 8. Authentication flow

Signup: `register/page.tsx` → `POST /api/auth/register`
(rate-limit IP → `supabase.auth.signUp` with `full_name`/`role` metadata →
generic response) → email confirmation via `/auth/confirm`.
Login: `login/page.tsx` → `POST /api/auth/login` (validate → check IP+email
buckets → `signInWithPassword` → `recordFailure` on both keys or
`recordSuccess` on email key → resolve trusted role from `profiles`,
self-healing insert of `profiles` + `students`/`lecturers` row) → redirect to
role dashboard. Recovery: `forgot-password/page.tsx` →
`POST /api/auth/recovery` (always-generic response) → reset link →
`reset-password/page.tsx` → `updatePassword`. Logout: browser
`supabase.auth.signOut()`. Role allow-list `sanitizePublicRole` permits only
student/lecturer signup; `prevent_role_escalation` trigger is the DB backstop.

## 9. Authorization flow

`proxy.ts` → `handleMiddleware`: refresh session cookies, `auth.getUser()`,
read role from `profiles` (never client input). `/student|lecturer|admin/*`
require session (else `/login?next=`); cross-role access redirects to own
dashboard; signed-in users on auth pages bounce to dashboard. Data-level:
RLS policies + service-layer `resolveActor()`/`requireOwner()` ownership
checks and `APPOINTMENT_TRANSITIONS` allow-list. `access.ts`
(`getServerSession`/`requireServerRole`) exists but is not yet wired into pages.

## 10. Appointment flow

Statuses: `pending → approved|rejected|cancelled|rescheduled`;
`approved|rescheduled → completed|cancelled|rescheduled|no-show`;
terminal: `rejected|cancelled|completed|no-show`. Types: `in-person|online`.
Student books (`createAppointment`: session student id, lecturer/course
validation, future-slot + `assertSlotAvailable`, exclusion constraint as
atomic backstop, friendly `BookingConflictError` mapping). Lecturer:
approve/reject/cancel/reschedule/complete/no-show via dedicated transitions.
History auto-logged by trigger; notifications via `notify_appointment_event`
trigger when live (mock path creates them in-process).

## 11. Availability flow

Recurring weekly rules (`day_of_week`, `start/end_time`, `is_active`) +
one-off `availability_exceptions` + appointment blocking. Overlap prevented
by trigger; slot generation in `scheduling/slots.ts` over institution
timezone with half-open ranges; timezone conversion in `scheduling/datetime.ts`.

## 12. Notification flow

Types: request/approved/rejected/cancelled/rescheduled/reminder/system.
Live: DB trigger `notify_appointment_event` creates rows; services read
`notifications` by `user_id` (= profile id) with unread counts. Mock: created
inline by appointment transitions via `createNotification`.

## 13. Environment variables

Committed (`.env.example`, placeholders only): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, commented `SUPABASE_SERVICE_ROLE_KEY`,
`AUTH_LOGIN_MAX_ATTEMPTS/WINDOW_SECONDS/LOCKOUT_SECONDS`,
`AUTH_RECOVERY_*`, `AUTH_REGISTER_*`. Local (`.env.local`, keys only listed,
values never read): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. `NEXT_PUBLIC_SITE_URL` is referenced in
auth routes but absent from both files (email-redirect falls back to
relative-path behavior when unset).

## 14. Known issues / concerns before migration

- Dirty + untracked work: 4 modified files and `src/app/api/`,
  `src/lib/security/`, the rate-limit migration are untracked — commit or
  stash before migration so the cutover diff is reviewable.
- `profiles.id` is FK-bound to `auth.users.id`; self-managed auth must
  replace this link (`users` table) and re-home every FK.
- RLS disappears with Supabase — every policy in `..._000001` must be
  re-implemented as server-side ownership checks; `access.ts` helpers are
  not yet enforced in pages.
- Rate limiter falls back to in-memory store without service-role key;
  self-managed design must use a `pg`-backed store (production-safe).
- `npm run lint` is slow on first run (see §15); allow ~5+ min on Windows.
- No storage/realtime to migrate (confirmed absent) — auth + Postgres RLS
  replacement are the critical path.

## 15. Test status (actually executed 2026-10-05)

- `npx tsc --noEmit` — PASS (no output).
- `npm test` (`vitest run`) — PASS: **5 files, 82 tests, all passed**
  (`datetime` 10, `slots` 19, `auth-security` 13, `rate-limit` 27,
  `appointments` 13). Note: `npm test -- --run` (extra flag) hangs; use
  plain `npm test`.
- `npm run lint` — PASS with **0 errors, 8 warnings** (all pre-existing
  `react-hooks/incompatible-library` React Compiler skips on
  `watch()` usage + one `@next/next/no-img-element` in `ui/avatar.tsx`).
  First run exceeds 3 min on Windows — completed on retry with 10 min timeout.

## 16. Build status (actually executed 2026-10-05)

- `npm run build` — PASS. Turbopack compiled in ~45s, TypeScript ~18s,
  37 static/dynamic routes generated, no errors. Route table matches §3.
