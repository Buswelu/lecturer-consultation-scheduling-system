# LCSS — Supabase Rollback & Cleanup Record (Stage 7, 2026-10-07)

> PostgreSQL (`Consultation_db`) is the sole authoritative datastore for
> authentication AND application data. Supabase rollback is RETIRED as of
> this cleanup: the packages, clients, auth routes, and mock data below were
> removed after proving zero active usage (Phases 1–2 audit). Git history
> preserves everything removed (`git log --diff-filter=D`). What remains is
> inert history/docs only. No deployment performed.

## A. Active application path — NO Supabase (re-verified Stage 7)

Repository search 2026-10-07: no active component, page, hook, service,
repository, script, or API route imports `@supabase/*`,
`@/lib/supabase/*`, or `@/lib/mock-data`. The shared row-mapping modules
now live at `src/lib/db/mappers.ts` + `src/lib/db/database.types.ts`
(pure, no client inside).

## A. Active application path — NO Supabase

Verified 2026-10-06 by repository search: no active component, page, hook,
service, repository, or API route imports `@supabase/*`,
`@/lib/supabase/{client,server,auth,middleware,access}`, or
`@/lib/mock-data`, except the legacy fallbacks noted under E.

## B. Rollback / legacy (kept, untouched)

- `src/lib/supabase/*` (client, server, middleware, auth, access, mappers,
  database.types) — old backend + auth. Note: `mappers.ts` /
## B. Removed in Stage 7 (verified unused, full suite green after removal)

- `src/app/api/auth/*` (login/recovery/register) + `src/app/auth/confirm/*` —
  legacy Supabase auth endpoints; frontend uses `/api/pg-auth/*` exclusively.
- `src/lib/supabase/{client,server,middleware,auth,access}.ts` — old clients;
  shared `mappers.ts`/`database.types.ts` relocated to `src/lib/db/`.
- `src/lib/mock-data/*` (7 datasets) — zero importers; mock branches in
  `useSessionIds.ts`/`navbar.tsx` removed (PostgreSQL session mandatory).
- `scripts/provision-demo-users.mjs`, `scripts/verify-phase{3,5}.local.ts` —
  Supabase-era dev tools, superseded by `db:provision` + vitest.
- `PostgresRateLimitStore`/`getRateLimitStore` singleton in
  `src/lib/security/rate-limit.ts` — superseded by `rate-limit-pg.ts`.
- npm packages `@supabase/ssr`, `@supabase/supabase-js`,
  `@electric-sql/pglite` (the latter never imported) — uninstalled.
- `.env.example` + `.env.local` Supabase variables removed.

## C. Test-only (updated, not weakened)

- `auth-security.test.ts` — server-enforcement assertions retargeted from
  deleted `api/auth/*` routes to the live `api/pg-auth/*` implementation.
- `rate-limit.test.ts` — fake-adapter block for the removed store deleted;
  live pg limiter covered by `pg-rate-limit.test.ts` (real DB).
- `appointments.test.ts` — pure transition/error-mapping unit tests.

## D. Documentation / comments

- References in `docs/*`; code comments noting Supabase parity
  (`repositories/*`, `services/*`, `proxy.ts`, `require.ts`).

## E. Retained history (inert, never imported by the app)

- `supabase/` (migrations incl. `20260909000000_auth_rate_limits.sql`,
  seed, diagnostics) — schema archaeology only.
- `docs/MIGRATION-SNAPSHOT.md`, `docs/POSTGRESQL-MIGRATION-PLAN.md` —
  stage history; `auth-security.test.ts` migration-shape tests still read
  the rate-limit migration file.

## Verification performed (Stage 7)

- `npm test`, `tsc`, `build`, `lint`, `doctor` all green post-removal.
- HTTP smoke: register/login/logout/me, identifier + email login,
  booking → approval → notifications, admin overview/users/reports,
  deactivation cycle, pagination, ghost enumeration checks.
