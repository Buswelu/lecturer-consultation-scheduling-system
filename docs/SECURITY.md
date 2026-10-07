# LCSS — Security Audit (Stage 6)

> Scope: focused audit of the self-managed stack (Next.js + PostgreSQL).
> No speculative changes: every fix below is tested. Production deployment
> is out of scope (no deploy performed).

## Authentication & sessions — PASS

- Argon2id only (`password.ts`); dummy-hash fallback on unknown emails.
- Opaque 256-bit tokens; only HMAC-SHA256(token, SESSION_SECRET) stored.
- `lcss_session`: HttpOnly, SameSite=Lax, Path=/, Secure in production.
- Sliding expiry (server default 7 days, `SESSION_TTL_SECONDS`); expired
  sessions rejected; logout deletes the row + clears the cookie.
- Password reset consumes single-use expiring tokens AND revokes all sessions.
- **Fixed (Stage 6):** session validation now also requires `users.is_active`,
  so deactivated accounts fail closed even with a live token (sessions are
  additionally deleted at deactivation). Tested.

## Authorization — PASS

- Every data route resolves the actor from the session cookie
  (`pgContext`); role gates via `requirePgRole` equivalents; ownership in
  repositories (`ForbiddenError` → 403). No client IDs trusted (tested:
  spoofed `studentId` ignored, cross-owner reads/writes denied).
- Proxy enforces `/student|lecturer|admin/*` + bounces auth pages.

## CSRF — acceptable

- Mutations are JSON `fetch` POST/PATCH/DELETE with `SameSite=Lax` cookies:
  cross-site top-level POSTs carry no cookie. No cookie-tossing vectors
  (single cookie, host-only). No changes made.

## Rate limiting — PASS

- Atomic PostgreSQL counting (`SELECT … FOR UPDATE`), per-account buckets
  close the email/identifier-switch bypass (tested, incl. concurrency).

## Input & SQL — PASS

- Zod bodies on all data/auth routes; pagination params clamped
  (1..200); parameterized SQL only (sweep: no interpolation of values;
  the 3 dynamic-SQL sites use fixed allow-lists: ORDER BY constant,
  table allow-list, LIMIT/OFFSET integers).
- Error mapping: 401/403/404/409/400 with generic messages; no SQL,
  credentials, or traces leak (tested: error bodies contain no SQL).

## Enumeration — PASS

- Login/recovery stay generic for unknown identifiers/emails; no public
  existence oracle (public check endpoint removed in Stage 4.5); invalid
  session ≡ anonymous everywhere.

## Secrets — PASS

- Sweep 2026-10-06: no real passwords/tokens/keys in `src/`,
  `scripts/db/`, `db/` (only a legacy *demo* password in Supabase-era
  scripts + seed docs, dev-only and documented). `.env.local` git-ignored;
  no `NEXT_PUBLIC_*` secrets; `npm run doctor` enforces this continuously.

## Headers — added

- `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `X-Frame-Options: DENY` in
  `next.config.ts` (no app behavior change).

## Not changed (documented decisions)

- No CORS config (same-origin app, no cross-origin API consumers).
- No email provider (dev-token flow retained, prod-gated).
- `useSessionIds`/navbar mock fallbacks are dead code while a backend is
  configured (kept for archived preview reference, never in the active path).
