-- ===========================================================================
-- LCSS self-managed PostgreSQL — 002 authentication tables
--
-- Replaces Supabase Auth (`auth.users`). Identity chain for the new backend:
--   users.id → profiles.id → students.profile_id / lecturers.profile_id
--
-- Notes:
--   * Passwords are NEVER stored in plaintext: `password_hash` holds an
--     Argon2id hash created by the Node application (auth stage, later).
--   * Sessions store only a SHA-256 hash of the cookie token; the raw token
--     lives only in the browser's HttpOnly cookie.
--   * No RLS: authorization is enforced server-side in Next.js. The database
--     role used by the app owns these tables; nothing browser-side connects.
-- ===========================================================================

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text not null,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  is_active boolean not null default true
);

create index users_email_idx on public.users (email);
create index users_is_active_idx on public.users (is_active) where is_active;

create trigger set_updated_at_users
  before update on public.users
  for each row execute function public.set_updated_at();

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index sessions_user_id_idx on public.sessions (user_id);
create index sessions_expires_at_idx on public.sessions (expires_at);

create table public.password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index password_resets_user_id_idx on public.password_resets (user_id);

create table public.email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index email_verifications_user_id_idx on public.email_verifications (user_id);
