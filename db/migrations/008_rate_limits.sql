-- ===========================================================================
-- LCSS self-managed PostgreSQL — 008 rate limits
--
-- Ported from Supabase migration 20260909000000 with ONE deliberate change:
--   `key text PRIMARY KEY` instead of (uuid id + unique key).
-- Reason: every access is by key (get/upsert/delete); the surrogate uuid
-- was never referenced. Identical semantics, one less index.
-- Counters + timestamps only — NEVER passwords, tokens, or secrets.
-- No RLS (self-managed): only the server-side pool touches this table;
-- no API route exposes it.
-- ===========================================================================

create table public.auth_rate_limits (
  key text primary key,
  attempts integer not null default 0 check (attempts >= 0),
  first_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  blocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index auth_rate_limits_blocked_until_idx
  on public.auth_rate_limits (blocked_until);
create index auth_rate_limits_last_attempt_at_idx
  on public.auth_rate_limits (last_attempt_at);

create trigger set_updated_at_auth_rate_limits
  before update on public.auth_rate_limits
  for each row execute function public.set_updated_at();

-- Periodic cleanup (run from a cron job or manually) so the table stays
-- bounded. The application also prunes lazily on each check.
--   delete from public.auth_rate_limits
--   where coalesce(blocked_until, now() - interval '1 second') < now()
--     and last_attempt_at < now() - interval '2 hours';
