# LCSS — Self-Managed PostgreSQL Guide

> Never commit real credentials to Git. The app pool (`src/lib/db/pool.ts`)
> is a process-wide singleton: max 10 connections, 30 s idle timeout, 10 s
> connection timeout — suitable for local dev and small serverless fleets
> (see `docs/DEPLOYMENT.md` §9 for production pooling notes).

## Assumptions

- PostgreSQL 18 installed locally (verified: `PostgreSQL 18.6`).
- Server reachable at `localhost:5432` (check pgAdmin → server Properties →
  Connection if your port differs).
- Database `Consultation_db` created (via pgAdmin: right-click Databases →
  Create → Database, or `CREATE DATABASE "Consultation_db";`).
- Node dependencies installed (`npm install` — includes `pg`).

## Configuration

Server-only variable in `.env.local` (git-ignored, never `NEXT_PUBLIC_*`):

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/Consultation_db"
```

Optional guard override (defaults to `Consultation_db`; scripts refuse any
other database unless you set this explicitly):

```env
LCSS_TARGET_DB=Consultation_db
```

## Migrations

Files live in `db/migrations/` and run in filename order; applied files are
recorded in `public.schema_migrations` and never re-run automatically.

| File | Contents |
|---|---|
| `001_extensions.sql` | `pgcrypto`, `btree_gist`, `citext` + `set_updated_at()` helper |
| `002_auth.sql` | `users`, `sessions`, `password_resets`, `email_verifications` |
| `003_profiles.sql` | `profiles` → `users` (replaces `auth.users` link) |
| `004_academic.sql` | `departments`, `students`, `lecturers`, `courses`, `lecturer_courses` |
| `005_availability.sql` | `availability`, `availability_exceptions`, overlap trigger |
| `006_appointments.sql` | `appointments`, GiST exclusion, update-rules + history triggers (`app.actor_id`) |
| `007_history_notifications.sql` | `appointment_history` (nullable `changed_by`), `notifications` |
| `008_rate_limits.sql` | `auth_rate_limits` (keyed by `key`) |

```bash
npm run db:status    # applied vs pending
npm run db:migrate   # apply pending only
npm run db:seed      # idempotent dev seed (departments + courses)
npm run db:seed:dev  # dev scenario data: every course ↔ every lecturer,
                     # Mon–Fri 09:00–12:00 + 14:00–16:00 availability
npm run db:verify    # schema report + conflict-guard tests (rolled back)
npm run db:reset -- --yes   # DEVELOPMENT ONLY: drop everything, migrate, seed
npm run doctor       # readiness checks: env, secrets hygiene, DB, migrations
```

Deliberate deviations from the Supabase schema (see
`docs/POSTGRESQL-MIGRATION-PLAN.md` §5): `profiles.id → users.id`;
`appointment_history.changed_by` nullable; `auth_rate_limits.key` is the
primary key; `notify_appointment_event` trigger not ported (services write
notifications); no RLS — authorization is server-side in Next.js.

## Inspecting with pgAdmin

Connect a server (Host `localhost`, Port `5432`, user `postgres`), open
`Consultation_db` → Schemas → public → Tables. Key tables: `users`,
`profiles`, `students`, `lecturers`, `departments`, `courses`,
`lecturer_courses`, `availability`, `availability_exceptions`,
`appointments`, `appointment_history`, `notifications`, `sessions`,
`auth_rate_limits`, `schema_migrations`. Same via CLI:
`psql "$DATABASE_URL" -c "\dt"` (quote the URL; never paste it into docs).

## Backups

```bash
pg_dump "$DATABASE_URL" -F c -f lcss-backup.dump   # create backup
pg_restore -d "$DATABASE_URL" lcss-backup.dump      # restore
```

Store backups outside the repo. Never commit backups or passwords to Git.

## Reset behavior

`npm run db:reset -- --yes` drops the entire `public` schema on
`Consultation_db` and re-migrates + re-seeds. It refuses to run without
`--yes` and refuses any other database. Never run against production data.
