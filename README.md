# LCSS — Lecturer Consultation Scheduling System

Next.js App Router + TypeScript + Tailwind/shadcn/ui, backed exclusively by
self-managed PostgreSQL (`Consultation_db`). Authentication is application-owned
(Argon2id, opaque `lcss_session` cookies, PostgreSQL rate limiting).

## Prerequisites

- Node.js 20+ and npm
- PostgreSQL 16+ with a `Consultation_db` database (managed via pgAdmin)

## Setup (local development)

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in the **server-only** values
(placeholders only — never commit real secrets):

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/Consultation_db"
SESSION_SECRET="<64 hex chars from: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">"
```

Then initialize the database and start the app:

```bash
npm run db:migrate   # apply pending migrations (tracked, idempotent)
npm run db:seed      # reference data: departments + courses
npm run db:seed:dev  # dev scenario data: assignments + availability
npm run doctor       # readiness checks (env, secrets hygiene, DB, migrations)
npm run dev          # http://localhost:3000
```

Create local accounts (prints a one-time password — store it safely):

```bash
npm run db:provision -- admin admin@university.edu "System Admin"
npm run db:provision -- student student@university.edu "Test Student"
npm run db:provision -- lecturer lecturer@university.edu "Test Lecturer"
```

Log in with the printed registration/staff/admin identifier (or email).

## Verification

```bash
npm test            # full suite (real PostgreSQL)
npx tsc --noEmit
npm run build
npm run lint
npm run db:verify   # schema report + DB conflict-guard tests (rolled back)
```

## Documentation

- `docs/DATABASE.md` — setup, migrations, seed, pgAdmin, backups/restore
- `docs/AUTHENTICATION.md` — identifiers, sessions, rate limiting, provisioning
- `docs/DATA-LAYER-MIGRATION.md` — Supabase → PostgreSQL service inventory
- `docs/SUPABASE-ROLLBACK.md` — what was removed, what remains, and why
- `docs/SECURITY.md` — security audit findings and boundaries
- `docs/MIGRATION-SNAPSHOT.md`, `docs/POSTGRESQL-MIGRATION-PLAN.md` — history

## Backups

```bash
pg_dump "$DATABASE_URL" -F c -f lcss-backup.dump   # back up (see docs/DATABASE.md)
```

Store backups outside the repo. Never commit backups, passwords, or secrets.
