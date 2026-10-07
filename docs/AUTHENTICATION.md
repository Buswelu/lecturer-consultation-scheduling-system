# LCSS — Self-Managed PostgreSQL Authentication

> Stage 3. The new system lives alongside Supabase auth (rollback path).
> Frontend pages still use Supabase; cutover happens in a later stage.
> Never commit real secrets. No plaintext passwords anywhere.

## Architecture

```text
Browser (fetch only, no tokens in localStorage)
  ↓  POST /api/pg-auth/* (Zod-validated JSON)
Next.js Route Handlers (rate-limit → service → Set-Cookie)
  ↓  src/lib/auth/* (parameterized SQL, transactions)
PostgreSQL: users / sessions / profiles / students / lecturers /
            password_resets / email_verifications / auth_rate_limits
```

Cookie `lcss_session` holds an opaque 256-bit token
(`HttpOnly; SameSite=Lax; Path=/; Secure` in production, `Max-Age` = TTL).
PostgreSQL stores `HMAC-SHA256(token, SESSION_SECRET)` — the raw token never
touches the database, and the DB alone yields no usable session.

## Tables

- `users(id, email CITEXT UNIQUE, password_hash, email_verified_at,
  created_at, updated_at, last_login_at, is_active)` — the identity.
- `sessions(id, user_id → users CASCADE, token_hash UNIQUE, expires_at,
  created_at, last_seen_at)` — server sessions, sliding expiry.
- `profiles(id → users.id CASCADE, full_name, email, phone, avatar_url,
  role ∈ student|lecturer|admin)` — role source of truth.
- `password_resets / email_verifications(user_id, token_hash UNIQUE,
  expires_at, used_at?)` — single-use token stores (hashes only).

## Password hashing

Argon2id (`argon2` package: 19 MiB, t=2, p=1). `hashPassword` /
`verifyPassword` in `src/lib/auth/password.ts`. Unknown-email logins verify
against a dummy hash so timing does not reveal account existence.

## Registration (`registerPgUser` + `POST /api/pg-auth/register`)

Zod-validated (email ≤ 320, password 6–256, name 3–200, role
student|lecturer). Flow: normalize email → register-IP rate check →
duplicate check (generic error either way) → Argon2id hash → ONE transaction
(`users` + `profiles` + `students|lecturers` + verification token). Public
`role=admin` is coerced to `student`; admins come only from `createPgAdmin`
(provisioning/tests, never a public route).

## Login (`loginPgUser` + `POST /api/pg-auth/login`)

Primary handle is the system-generated identifier, backup is email — both
resolve to the same `users.id`. Normalize → check IP + credential + account
buckets (429 + `Retry-After` when blocked) → fetch user → verify (dummy-hash
fallback) → reject inactive → 401 generic
`Invalid username or password.` on any failure (records ALL buckets) →
`recordSuccess` on all buckets → `createSession` → `last_login_at` → `{ ok,
role }` + session cookie. The credential bucket stops per-handle guessing;
the account bucket stops switching between a user's identifier and email to
dodge the limit. Success responses never include hashes or tokens.

## Login identifiers (Stage 4.5)

Formats (prefix namespaces are disjoint; validation in
`src/lib/auth/identifiers.ts`, usable client-side for instant feedback):

- student: `STU-YYYY-NNNN` (e.g. `STU-2026-0001`), mirrored in
  `students.student_number` (NOT NULL, UNIQUE)
- lecturer: `LEC-YYYY-NNNN`, mirrored in `lecturers.staff_number`
  (NOT NULL, UNIQUE)
- admin: `ADM-NNNN` (e.g. `ADM-0001`), stored on `users.username` only

Generation is server-side via PostgreSQL sequences
(`student_number_seq` / `lecturer_number_seq` / `admin_number_seq`) inside
the registration/provisioning transaction — unique under concurrency, never
user-chosen, never `Math.random()`. `users.username` is CITEXT UNIQUE NOT
NULL with a format CHECK. Ordinary users have no endpoint that changes it.

Login accepts `{ username, password }` (identifier or email); a legacy
`{ email, password }` shape is coerced for compatibility. The server — never
a role picker — determines the real role from `profiles`.
`GET /api/pg-auth/check-identifier?username=…` reports format validity +
category only; it performs no database lookup and reveals no existence.

## Provisioning

Public registration auto-generates and displays the identifier (dev
self-registration). Official accounts are provisioned by an admin:

```bash
node scripts/db/provision.mjs <student|lecturer|admin> <email> "<Full Name>"
npm run db:provision -- admin admin@university.edu "System Admin"
```

The script prints the identifier and a one-time random password ONCE (email
pre-verified for local dev). No passwords are hardcoded. Guarded to
`Consultation_db` like all db scripts.

## Admin control center

`GET /api/admin/overview` (requires `requirePgRole("admin")` on the session)
returns table row counts, users-by-role, active sessions, and rate-limit
summary — never hashes, tokens, secrets, or SQL. `/admin/dashboard` renders
a System Overview section from it alongside the existing cards.

## Logout / me

`POST /api/pg-auth/logout` deletes the session row and clears the cookie
(succeeds when already logged out). `GET /api/pg-auth/me` returns
`{ id, email, role, fullName, studentId, lecturerId }` (entity ids null when
n/a) or 401. Stage 4 cutover: all frontend auth flows use these endpoints.

## Authorization (`src/lib/auth/require.ts`)

`getCurrentPgUser(token)`, `requirePgUser` (401), `requirePgRole` (401/403),
`requirePgAnyRole` (401/403). Identity comes ONLY from the session cookie;
role from `profiles`. Same contract as `lib/supabase/access.ts` for cutover.

## Rate limiting (`src/lib/auth/rate-limit-pg.ts`)

Same policies as the Supabase-era limiter (login 5/300s/900s, recovery
3/3600s/3600s, register 5/3600s/3600s, env-overridable). `recordPgFailure`
is atomic (`SELECT … FOR UPDATE` + upsert in one transaction, one retry on
insert race); checks are read-only. Only real failures count; success clears
the email bucket. Table holds keys + counters + timestamps only.

## Email verification / password reset

Hashed single-use expiring tokens (verify 24 h, reset 1 h). Reset consumes
the token AND revokes all user sessions. Recovery accepts an identifier or
an email and resolves the account's recovery email; responses are generic
(no account enumeration). No mail server is configured: with `LCSS_DEV_TOKENS=1` (never
production) the token is returned in JSON for local testing; otherwise read
`token_hash` rows via pgAdmin and use `/api/pg-auth/verify-email` (body
`{ token }`) or `/api/pg-auth/reset-password` (body `{ token, password }`).

## pgAdmin vs LCSS admin

The human owner manages PostgreSQL through pgAdmin (schema, backups, raw
data). The LCSS `/admin/*` web area exposes only approved application-level
administration (counts, user status, assignments) — never `DATABASE_URL`,
passwords, hashes, tokens, or arbitrary SQL.

## Environment (server-only, see `.env.example`)

`DATABASE_URL`, `SESSION_SECRET` (≥ 32 random chars, required),
`SESSION_TTL_SECONDS` (default 604800), `APP_URL` (default
http://localhost:3000), existing `AUTH_*` tunables, `LCSS_DEV_TOKENS=1`
(local token exposure, never production).

## Development test accounts

Provisioned in the local `Consultation_db` (passwords were printed once at
creation and are not recorded here — re-provision or use password recovery
if lost):

- admin: `ADM-0017` / admin@university.edu — System Admin
- student: `STU-2026-0233` / student-dev@university.edu — Dev Student
- lecturer: `LEC-2026-0090` / lecturer-dev@university.edu — Dev Lecturer

Sequence gaps (e.g. non-0001 numbers) are normal: PostgreSQL sequences never
reuse values, including ones consumed by rolled-back test transactions.

## Security checklist

Argon2id only · HTTP-only cookies · opaque HMAC-bound tokens · sliding
expiry · generic errors · Zod everywhere · parameterized SQL only ·
transactional registration · atomic rate counting · single-use expiring
tokens · no secrets in frontend, logs, or Git · Supabase path untouched
(rollback intact).
