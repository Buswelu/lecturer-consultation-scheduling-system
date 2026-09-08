-- ===========================================================================
-- LCSS Phase 4 — 0002 availability overlap prevention
--
-- Rejects overlapping ACTIVE availability rows for the same lecturer and
-- weekday. Adjacent ranges (existing end == new start) remain allowed:
-- overlap is strict ([start, end) ∩ [start, end) ≠ ∅).
--
-- This is the database backstop. The service layer (`services/availability`)
-- runs the same check first (`findOverlappingWindow`) to return friendly
-- errors; RLS ownership policies are unchanged.
--
-- Safe/idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS. Verified
-- against the seed data — no two active rows for one lecturer share a day
-- with overlapping times, so applying this cannot fail on existing rows.
-- Apply with: Supabase Dashboard → SQL Editor (after 0000/0001).
-- ===========================================================================

create or replace function public.prevent_availability_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Inactive rows never generate slots, so they cannot conflict.
  if new.is_active is not true then
    return new;
  end if;

  if exists (
    select 1
    from public.availability existing
    where existing.lecturer_id = new.lecturer_id
      and existing.day_of_week = new.day_of_week
      and existing.is_active is true
      and existing.id is distinct from new.id
      and new.start_time < existing.end_time
      and new.end_time > existing.start_time
  ) then
    raise exception
      'Availability overlaps an existing availability period for this weekday.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_availability_overlap_trigger on public.availability;

create trigger prevent_availability_overlap_trigger
  before insert or update of lecturer_id, day_of_week, start_time, end_time, is_active
  on public.availability
  for each row execute function public.prevent_availability_overlap();
