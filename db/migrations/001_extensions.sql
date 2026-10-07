-- ===========================================================================
-- LCSS self-managed PostgreSQL — 001 extensions + shared trigger helper
--
-- Extensions (all stock PostgreSQL, safe on fresh databases):
--   pgcrypto   – gen_random_uuid() for UUID primary keys
--   btree_gist – GiST support for the appointment anti-double-booking
--                exclusion constraint (006_appointments.sql)
--   citext     – case-insensitive email uniqueness on users.email
-- No Supabase extensions are used.
-- ===========================================================================

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Shared helper: auto-maintain updated_at on every row change.
-- (Ported from Supabase migration 20260908000000; no auth dependency.)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
