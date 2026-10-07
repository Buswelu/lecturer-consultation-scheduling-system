# LCSS — Data-Layer Migration Inventory (Stage 5, Phase 1 — COMPLETED)

> Audit date: 2026-10-06. Every active Supabase data operation found by
> repository-wide search (`from(`, `insert(`, `update(`, `delete(`, `rpc(`,
> `supabase`, `.select(`). Auth (`supabase.auth.*`) is already PostgreSQL —
> only the **data path** is inventoried here.
>
> STATUS: migrated. `src/lib/services/*` are fetch clients over
> `/api/*` → `src/lib/db/repositories/*` → `Consultation_db`.
> Remaining Supabase references are classified at the bottom.

## Feature → current source → target

```text
Feature                    Current Source              Target
---------------------------------------------------------------
Lecturer directory         Supabase (anon+RLS)         pg repo + /api/lecturers
Lecturer profile           Supabase                    pg repo + /api/lecturers/[id]
Courses                    Supabase                    pg repo + /api/courses
Departments                Supabase                    pg repo + /api/departments
Lecturer-course assign     Supabase                    pg repo + /api/courses/[id]/assign
Availability rules         Supabase                    pg repo + /api/availability
Availability exceptions    Supabase                    pg repo + /api/availability/exceptions
Slot generation            browser (Supabase reads)    server compute + /api/availability/slots
Appointments               Supabase                    pg repo + /api/appointments (+tx)
Appointment history        Supabase trigger+reads      pg trigger + /api/appointments/[id]
Notifications              Supabase (+trigger)         pg repo + /api/notifications (+tx writes)
Appointment conflict       Supabase GiST exclusion     SAME constraint in Consultation_db (Stage 2)
Availability overlap       Supabase trigger            SAME trigger in Consultation_db (Stage 2)
Admin directory            Supabase                    pg repo + /api/admin/users (exists)
Admin reports              Supabase (client computed)  pg repo + /api/admin/reports (aggregates)
Student/lecturer profiles  Supabase                    pg repo (scoped reads)
Name lookups               mock-data sync helpers      embedded API display names
```

## Files with active Supabase data ops (all in `src/lib/services/*`)

- `appointments.ts` (~30 query sites), `availability.ts` (~10),
  `courses.ts` (~8), `departments.ts` (~3), `lecturers.ts` (~5),
  `notifications.ts` (~5), `students.ts` (~4), `users.ts` (~6).
- No `rpc(`, `storage.`, or realtime `channel(` usage anywhere (verified).
- `src/lib/supabase/mappers.ts` row→domain mapping is **reused**: pg rows
  share the same snake_case shape, so repositories map through it.

## Table mapping (Supabase → Consultation_db)

Identical names/columns except: `profiles.id → users.id` (was
`auth.users.id`); `users/sessions/password_resets/email_verifications`
are new (auth); `appointment_history.changed_by` nullable (system writes);
`auth_rate_limits.key` is the PK. No RLS in pg — ownership enforced in
repositories/routes (policy map in `docs/POSTGRESQL-MIGRATION-PLAN.md` §7).

## Consumer contract (preserved)

All `src/lib/services/*` export names stay; browser components keep
importing services (now fetch wrappers, `cache: "no-store"`). Dropped:
`IS_MOCK` branches (pg backend is now mandatory — auth already requires it),
mock-data sync name helpers (replaced by embedded API display names),
`assertSlotAvailable` (moved server-side into booking tx),
`createNotification` public export (server-internal now).

## Rollback classification (post-migration)

- `src/lib/supabase/*`, `supabase/*`, `@supabase/*` deps → ROLLBACK/reference
  (kept on disk, no longer in the active request path).
- `src/lib/supabase/mappers.ts` + `database.types.ts` → SHARED (pure
  row↔domain mapping reused by the pg repositories; no client inside).
- `src/lib/mock-data/*` → LEGACY (kept for archived behavior reference).
- `src/app/api/auth/*`, `src/app/auth/confirm/*` → LEGACY (Supabase auth,
  superseded by `/api/pg-auth/*`).

## New request path (Stage 5)

```text
Browser component
  ↓  src/lib/services/* (fetch, cache: no-store, same function names)
Next.js API route (/api/lecturers, /api/courses, /api/departments,
  /api/availability[/slots][/exceptions], /api/appointments[/[id]],
  /api/notifications[/[id]], /api/admin/*)
  ↓  pgContext (session → actor, optional role gate) + Zod validation
src/lib/db/repositories/* (parameterized SQL, transactions, notifications,
  audit actor) → Consultation_db (exclusion constraint, triggers)
```

Dropped service surface (documented, no consumers remain): `IS_MOCK`
branches, mock sync name helpers (names now embedded server-side),
`assertSlotAvailable` (server-side in booking tx), public
`createNotification` (server-internal now). Kept for compat:
`APPOINTMENT_TRANSITIONS`, `assertTransitionAllowed`,
`toFriendlyBookingError`, `updateAppointmentStatus`, all read/mutation
names, `getDayLabel`/`dayOrder`/slot re-exports.

Dev scenario data: `npm run db:seed:dev` (all courses ↔ all lecturers,
Mon–Fri 09:00–12:00 + 14:00–16:00 EAT rules; idempotent).
