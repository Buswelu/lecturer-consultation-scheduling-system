# LCSS — Production Deployment Runbook (preparation only — nothing deployed)

> Audience: first-time deployer. Placeholders only — never real secrets.
> Free-tier facts are as of October 2026 and change often: re-verify limits
> on each provider's pricing page before committing to one.

## 1. Architecture

```text
Browser (HTTPS)
  ↓
Next.js 16 App Router (Node 20.9+, server-rendered + Route Handlers)
  ↓  pg Pool (max 10, server-only DATABASE_URL)
Managed PostgreSQL 14+ (extensions below)
```

- No Express, no workers/cron, no file storage (avatars are URL strings),
  no realtime channel (unread counts are plain queries + `cache: no-store`).
- Auth: Argon2id + opaque `lcss_session` cookie (HttpOnly, SameSite=Lax,
  Secure in production via `NODE_ENV=production`) + atomic pg rate limits.

## 2. Required infrastructure

- Node hosting with Next.js support (see §9).
- Managed PostgreSQL 14+ with these extensions (all stock `contrib`):
  `pgcrypto` (UUIDs), `citext` (case-insensitive email/usernames),
  `btree_gist` (appointment anti-double-booking exclusion constraint).
- The schema additionally relies on: GiST exclusion constraints, BEFORE/AFTER
  row triggers, `SECURITY`-plain plpgsql functions, `timestamptz` ranges,
  `gen_random_uuid()` — all core PostgreSQL, no exotic dependencies.
- Outbound email (Resend/Brevo/SMTP, §8) — required before disabling
  dev-token flows.

## 3. Environment variables (all server-only; never `NEXT_PUBLIC_*`)

| Variable | Production value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST:5432/DB` | pooled app connection |
| `SESSION_SECRET` | 64+ hex chars | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_URL` | `https://your-domain` | must be https in production (enforced) |
| `NODE_ENV` | `production` | set by the platform/build; enables Secure cookies + HSTS |
| `EMAIL_PROVIDER` | `resend`/`smtp` | `log` is dev-only; production refuses nothing but logs a warning-free no-op — configure a real provider |
| `AUTH_LOGIN_*`, `AUTH_RECOVERY_*`, `AUTH_REGISTER_*` | optional | tuning, defaults apply |
| `LCSS_DEV_TOKENS` | **unset** | `doctor` fails the deploy if set in production |

## 4. Database creation

1. Create an empty database (e.g. `lcss_prod`) in the provider dashboard.
2. Confirm the 3 extensions can be created
   (`create extension if not exists "btree_gist";` etc. — Neon/Supabase
   allow these; some providers restrict extension creation to superusers,
   in which case enable them from the provider dashboard first).
3. Point a LOCAL shell at it: `DATABASE_URL=<prod-url> npm run db:status`.

## 5. Extensions

`001_extensions.sql` creates `pgcrypto`, `btree_gist`, `citext` with
`IF NOT EXISTS` — safe to re-run. If the provider blocks `CREATE EXTENSION`
from the app role, enable the extensions in the dashboard, then migrate.

## 6. Migration process

```bash
DATABASE_URL="<prod-url>" npm run db:status    # expect: all pending
DATABASE_URL="<prod-url>" npm run db:migrate   # transactional, tracked
DATABASE_URL="<prod-url>" npm run db:status    # expect: 010 applied
DATABASE_URL="<prod-url>" npm run db:verify    # guard tests (rolled back)
```

- Use the provider's **direct (non-pooled)** connection string for
  migrations: DDL + multi-statement transactions misbehave behind
  PgBouncer-style transaction pooling. The app itself may use the pooled
  endpoint (`pg` holds one client per transaction, pool max 10).
- Rollback strategy: migrations are additive (`IF NOT EXISTS`, new tables,
  new nullable/DEFAULTed columns). There is NO automatic down-migration:
  for a bad deploy, restore the pre-deploy backup (next section) rather
  than inventing inverse DDL. Destructive changes must use expand/contract
  (add → backfill → cut over → drop) across releases.

## 7. Seed policy

- Production: run `db:seed` (departments/courses) ONLY if starting empty;
  never run `db:seed:dev` or `db:provision` against production data with
  throwaway values. Create the first admin via `db:provision` once, then
  rotate to a strong password immediately via password reset.
- Reference data re-seeds are `ON CONFLICT DO NOTHING` (never clobber edits).

## 8. Email configuration

Auth code depends only on `src/lib/email/{config,provider}.ts`:

```ts
sendVerificationEmail({ to, verifyUrl })   // ${APP_URL}/verify-email?token=…
sendPasswordResetEmail({ to, resetUrl })   // ${APP_URL}/reset-password?token=…
```

- Today `EMAIL_PROVIDER=log` records recipient+type server-side (never
  tokens/links) — development only.
- To go live: implement the 2-method interface (see Resend/Brevo sketches
  below), set `EMAIL_PROVIDER`, keep sends best-effort (auth requests must
  never fail on mail errors; tokens stay hashed server-side either way).
- Resend sketch: `npm i resend`, `new Resend(process.env.RESEND_API_KEY)`,
  `resend.emails.send({ from: "LCSS <noreply@your-domain>", to, subject,
  text })`. Needs a verified domain (test domain works for trials).
- SMTP sketch (Brevo/Gmail-app-password): `nodemailer` transporter from
  `EMAIL_SMTP_URL`, same two methods. Never commit credentials.

## 9. Application deployment + $0 options

| Layer | Option | Free tier (verify!) | Fit for LCSS |
|---|---|---|---|
| App | **Vercel Hobby** | $0, serverless, cold starts, Node 22 | **Recommended**: native Next.js, env UI, preview deploys |
| App | Netlify / Cloudflare Pages | $0 tiers exist | viable, weaker Next feature parity |
| Postgres | **Neon free** | $0: 3 projects, ~0.5 GB, autosleep (cold starts), pooled + direct endpoints | **Recommended**: full PG incl. btree_gist/pgcrypto/citext |
| Postgres | Supabase free | $0: ~0.5 GB, pauses when idle, full extensions | viable (schema originated here) |
| Email | **Resend free** | $0: ~100/day, needs domain | **Recommended** with custom domain |
| Email | **Brevo free** | $0: ~300/day SMTP+API | Recommended without a domain |

Recommended $0 architecture: **Vercel (app) + Neon (PostgreSQL) +
Resend-or-Brevo (email)**. Cold starts affect all free tiers (first request
after idle is slow; use Vercel cron sparingly or accept it). Neon free
connection limits (~100) comfortably fit `max: 10` per serverless instance.

## 10. Domain/TLS

Attach a custom domain in Vercel (automatic TLS) or use the provided
`*.vercel.app` HTTPS URL. `APP_URL` must be the canonical https URL —
`doctor` and the app itself refuse plain-http `APP_URL` in production,
which is what switches cookies to `Secure` + enables HSTS.

## 11. Backups

```bash
pg_dump "$DATABASE_URL" -F c -f lcss-$(date +%F).dump   # full backup
pg_restore --clean -d "$DATABASE_URL" lcss-<date>.dump # restore (DESTRUCTIVE)
```

- Pre-deployment backup, always; verify with `pg_restore --list`.
- Retention: keep ≥7 daily + pre-deploy snapshots; store outside the repo
  (object storage/private drive), encrypted at rest where possible.
- Managed providers (Neon/Supabase) also offer dashboard backups/PITR on
  free/paid tiers — enable what the tier allows IN ADDITION, not instead.

## 12. Health checks

- `GET /api/health` → `{status:"ok"|"degraded", database, migrationsCurrent}`
  (200/503, no secrets/internals). Point platform health checks here.
- `npm run doctor` in CI/pre-deploy: env strength, gitignore hygiene,
  DB reachability, extensions, migration count.

## 13. Rollback procedure

1. Vercel: instant rollback to the previous deployment (app code).
2. Database: app rollbacks do NOT reverse migrations — if a deploy shipped
   a bad migration, restore the pre-deploy backup to a NEW database, verify,
   then swap `DATABASE_URL`. Test this path on staging data first.

## 14. Troubleshooting

- `Secure` cookie missing over HTTPS → `NODE_ENV` isn't `production`.
- 429s on login → rate limiter working; check `auth_rate_limits` counts.
- Exclusion errors (23P01) in logs → genuine double-booking races (expected
  occasionally under concurrency), NOT a bug.
- Cold-start latency → free-tier sleep; first request warms the instance.

## 15. Security checklist (pre-deploy)

- [ ] `SESSION_SECRET` ≥ 32 random chars, unique per environment
- [ ] `LCSS_DEV_TOKENS` unset; dev accounts removed or rotated
- [ ] `APP_URL` https; HSTS present in prod build headers
- [ ] Email provider configured (no `log` in production)
- [ ] Backups tested (restore to a scratch DB at least once)
- [ ] `npm run doctor` green against production values
- [ ] No secrets in repo, logs, or error responses (see `docs/SECURITY.md`)
