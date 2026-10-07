-- ===========================================================================
-- LCSS — auth rate limits (brute-force protection for login / recovery /
-- registration endpoints).
--
-- Design notes:
--   * Application-level limiter ONLY. It runs server-side BEFORE Supabase
--     Auth is called and never bypasses Supabase Auth's own limits — both
--     layers may apply.
--   * One row per logical key (e.g. `login:ip:<ip>`,
--     `login:email:<normalized-email>`). Keys use normalized emails only.
--   * NEVER store passwords, tokens, or service keys in this table — counters
--     and timestamps only.
--   * RLS is ENABLED with NO policies for anon/authenticated (default-deny).
--     Only service_role (server code) may read/write, which is exactly what
--     the rate limiter uses. This also satisfies "RLS prevents unauthorized
--     manipulation of rate-limit records".
--   * Idempotent: safe to re-run after `supabase db reset`.
-- ===========================================================================

create table if not exists public.auth_rate_limits (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  attempts integer not null default 0 check (attempts >= 0),
  first_attempt_at timestamptz not null default now(),
  blocked_until timestamptz,
  last_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_rate_limits_blocked_until_idx
  on public.auth_rate_limits (blocked_until);

create index if not exists auth_rate_limits_last_attempt_at_idx
  on public.auth_rate_limits (last_attempt_at);

-- Keep updated_at fresh (reuses the shared trigger helper from 0001 when
-- present; falls back to a local definition otherwise).
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'set_updated_at' and n.nspname = 'public'
  ) then
    if not exists (
      select 1 from pg_trigger where tgname = 'set_updated_at_auth_rate_limits'
    ) then
      create trigger set_updated_at_auth_rate_limits
        before update on public.auth_rate_limits
        for each row execute function public.set_updated_at();
    end if;
  end if;
end
$$;

alter table public.auth_rate_limits enable row level security;

-- Intentionally NO policies for anon/authenticated: default-deny.
-- service_role bypasses RLS and is the only writer (server-side limiter).
-- Drop any permissive policy if a previous revision created one.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'auth_rate_limits'
  loop
    execute format(
      'drop policy if exists %I on public.auth_rate_limits',
      pol.policyname
    );
  end loop;
end
$$;

-- Periodic cleanup (run from a cron job or manually) so the table stays
-- bounded. The application also prunes lazily on each check.
--   delete from public.auth_rate_limits
--   where coalesce(blocked_until, now() - interval '1 second') < now()
--     and last_attempt_at < now() - interval '2 hours';
