-- ===========================================================================
-- LCSS self-managed PostgreSQL — 010 course credits
--
-- The course forms (admin + lecturer) have always exposed a credits input,
-- but no column existed so values were silently dropped. Adds:
--   credits integer NOT NULL DEFAULT 3 CHECK (1..12)
-- 1..12 admits every realistic curriculum value while the UIs keep their
-- own tighter ranges (1..6). Existing rows backfill to 3 via the default.
-- ===========================================================================

alter table public.courses
  add column if not exists credits integer not null default 3
    check (credits >= 1 and credits <= 12);
