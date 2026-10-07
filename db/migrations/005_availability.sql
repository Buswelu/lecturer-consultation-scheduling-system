-- ===========================================================================
-- LCSS self-managed PostgreSQL — 005 availability
--
-- Ported 1:1 from Supabase migrations 20260908000000 (tables/indexes) and
-- 20260908000002 (overlap trigger). No auth.uid() usage, no RLS.
-- Institution timezone Africa/Dar_es_Salaam is a display concern handled in
-- the application; stored values are wall times (recurring) and timestamptz
-- (exceptions), exactly as before.
-- ===========================================================================

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  lecturer_id uuid not null references public.lecturers (id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);

create index availability_lecturer_id_idx on public.availability (lecturer_id);
create index availability_day_of_week_idx on public.availability (day_of_week);

create trigger set_updated_at_availability
  before update on public.availability
  for each row execute function public.set_updated_at();

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  lecturer_id uuid not null references public.lecturers (id) on delete cascade,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_datetime < end_datetime)
);

create index availability_exceptions_lecturer_id_idx
  on public.availability_exceptions (lecturer_id);
create index availability_exceptions_start_datetime_idx
  on public.availability_exceptions (start_datetime);

create trigger set_updated_at_availability_exceptions
  before update on public.availability_exceptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Overlap prevention: rejects overlapping ACTIVE rows for the same lecturer
-- and weekday. Adjacent ranges (existing end == new start) stay allowed:
-- overlap is strict half-open ([start, end) ∩ [start, end) ≠ ∅).
-- ---------------------------------------------------------------------------
create or replace function public.prevent_availability_overlap()
returns trigger
language plpgsql
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

create trigger prevent_availability_overlap_trigger
  before insert or update of lecturer_id, day_of_week, start_time, end_time, is_active
  on public.availability
  for each row execute function public.prevent_availability_overlap();
