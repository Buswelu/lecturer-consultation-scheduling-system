-- ===========================================================================
-- LCSS self-managed PostgreSQL — 003 profiles
--
-- Ported from Supabase migration 20260908000000 with ONE change:
--   BEFORE: id uuid primary key references auth.users (id) on delete cascade
--   AFTER:  id uuid primary key references public.users (id) on delete cascade
-- Everything else (columns, role check, index, updated_at trigger) is kept.
--
-- Role escalation: Supabase used the `prevent_role_escalation` trigger backed
-- by auth.uid(). Self-managed authorization is enforced server-side in
-- Next.js (only admins may change roles), so no trigger is created here.
-- ===========================================================================

create table public.profiles (
  id uuid primary key references public.users (id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  avatar_url text,
  role text not null
    check (role in ('student', 'lecturer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.set_updated_at();
