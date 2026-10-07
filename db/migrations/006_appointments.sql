-- ===========================================================================
-- LCSS self-managed PostgreSQL — 006 appointments
--
-- Ported from Supabase migrations 20260908000000 (table/indexes) and
-- 20260908000003 (exclusion constraint, update rules, history trigger).
--
-- Supabase-specific replacements in this file:
--   * auth.uid() → app.actor_id transaction setting. The Next.js server sets
--     it per transaction from the verified session (`select set_config(
--     'app.actor_id', <profile-id>, true)`); see src/lib/db/transaction.ts.
--     Browser input is never trusted — the setting is server-side only.
--   * The `notify_appointment_event` trigger is intentionally DROPPED.
--     Notifications are written by the application services inside the same
--     transaction, preserving message texts and timing without an actor hack.
--   * No RLS policies are created. Authorization lives in Next.js services.
-- ===========================================================================

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id),
  lecturer_id uuid not null references public.lecturers (id),
  course_id uuid references public.courses (id) on delete set null,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  consultation_type text not null
    check (consultation_type in ('in_person', 'online')),
  status text not null default 'pending'
    check (status in (
      'pending', 'approved', 'rejected', 'cancelled',
      'completed', 'rescheduled', 'no_show'
    )),
  reason text not null,
  notes text,
  location text,
  meeting_link text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_datetime < end_datetime)
);

create index appointments_student_id_idx on public.appointments (student_id);
create index appointments_lecturer_id_idx on public.appointments (lecturer_id);
create index appointments_course_id_idx on public.appointments (course_id);
create index appointments_start_datetime_idx on public.appointments (start_datetime);
create index appointments_status_idx on public.appointments (status);

create trigger set_updated_at_appointments
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Atomic double-booking protection (unchanged from Supabase):
-- partial GiST exclusion — only ACTIVE statuses (pending/approved/
-- rescheduled) participate, so cancelled/rejected/completed/no_show rows
-- never block. Half-open ranges: adjacent slots (10:00–10:30 + 10:30–11:00)
-- do NOT conflict; identical or partial overlaps do (error 23P01).
-- ---------------------------------------------------------------------------
alter table public.appointments
  add constraint appointments_no_double_booking
  exclude using gist (
    lecturer_id with =,
    tstzrange(start_datetime, end_datetime) with &&
  )
  where (status in ('pending', 'approved', 'rescheduled'));

-- ---------------------------------------------------------------------------
-- Actor helpers: resolve the calling user from the server-supplied
-- `app.actor_id` setting (a profiles.id). NULL when unset (migrations,
-- maintenance scripts) — update rules then allow the write, exactly like
-- the old service_role bypass; application code ALWAYS sets it.
-- ---------------------------------------------------------------------------
create or replace function public.app_actor_id()
returns uuid
language plpgsql
stable
as $$
declare
  raw text := current_setting('app.actor_id', true);
begin
  if raw is null or raw = '' then
    return null;
  end if;
  return raw::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.app_actor_is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = public.app_actor_id() and role = 'admin'
  );
$$;

create or replace function public.app_actor_student_id()
returns uuid
language sql
stable
as $$
  select id from public.students where profile_id = public.app_actor_id();
$$;

create or replace function public.app_actor_lecturer_id()
returns uuid
language sql
stable
as $$
  select id from public.lecturers where profile_id = public.app_actor_id();
$$;

-- ---------------------------------------------------------------------------
-- Update guard (same rules as Supabase, actor via app.actor_id):
--   * admins: unrestricted;
--   * owning students: may only cancel (status → cancelled), rest immutable;
--   * owning lecturers: may change status / notes / location / meeting_link /
--     rejection_reason and may retime when (and only when) moving to
--     `rescheduled` from pending/approved/rescheduled;
--   * no actor (migrations/scripts): allowed (service_role equivalent).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_appointment_update_rules()
returns trigger
language plpgsql
as $$
declare
  caller_student uuid := public.app_actor_student_id();
  caller_lecturer uuid := public.app_actor_lecturer_id();
  times_unchanged boolean;
  retime_allowed boolean;
begin
  if public.app_actor_id() is null or public.app_actor_is_admin() then
    return new;
  end if;

  if caller_student is not null and old.student_id = caller_student then
    if new.status is distinct from old.status
       and new.status = 'cancelled'
       and new.student_id is not distinct from old.student_id
       and new.lecturer_id is not distinct from old.lecturer_id
       and new.course_id is not distinct from old.course_id
       and new.start_datetime is not distinct from old.start_datetime
       and new.end_datetime is not distinct from old.end_datetime
       and new.consultation_type is not distinct from old.consultation_type
       and new.reason is not distinct from old.reason then
      return new;
    end if;
    raise exception 'Students may only cancel their own appointment requests.';
  end if;

  if caller_lecturer is not null and old.lecturer_id = caller_lecturer then
    times_unchanged :=
      new.start_datetime is not distinct from old.start_datetime
      and new.end_datetime is not distinct from old.end_datetime;
    retime_allowed :=
      new.status = 'rescheduled'
      and old.status in ('pending', 'approved', 'rescheduled');

    if new.status in ('approved', 'rejected', 'completed', 'cancelled', 'rescheduled', 'no_show')
       and new.student_id is not distinct from old.student_id
       and new.lecturer_id is not distinct from old.lecturer_id
       and new.course_id is not distinct from old.course_id
       and new.consultation_type is not distinct from old.consultation_type
       and new.reason is not distinct from old.reason
       and (times_unchanged or retime_allowed) then
      return new;
    end if;
    raise exception 'Lecturers may only update status (and reschedule to new times) on their own appointments.';
  end if;

  raise exception 'Not authorized to modify this appointment.';
end;
$$;

create trigger enforce_appointment_update_rules_trigger
  before update on public.appointments
  for each row execute function public.enforce_appointment_update_rules();

-- ---------------------------------------------------------------------------
-- Audit history (actor via app.actor_id; system writes record NULL actor).
-- Retime details use Africa/Dar_es_Salaam wall-clock labels, as before.
-- ---------------------------------------------------------------------------
create or replace function public.log_appointment_history()
returns trigger
language plpgsql
as $$
declare
  time_note text := null;
begin
  if tg_op = 'INSERT' then
    insert into public.appointment_history
      (appointment_id, changed_by, old_status, new_status, action)
    values
      (new.id, public.app_actor_id(), null, new.status, 'created');
    return new;
  end if;
  if (new.start_datetime is distinct from old.start_datetime
      or new.end_datetime is distinct from old.end_datetime) then
    time_note :=
      'Time changed from '
      || to_char(old.start_datetime at time zone 'Africa/Dar_es_Salaam', 'DD Mon YYYY HH24:MI')
      || ' to '
      || to_char(new.start_datetime at time zone 'Africa/Dar_es_Salaam', 'DD Mon YYYY HH24:MI')
      || ' (EAT)';
  end if;
  if new.status is distinct from old.status then
    insert into public.appointment_history
      (appointment_id, changed_by, old_status, new_status, action, notes)
    values
      (new.id, public.app_actor_id(), old.status, new.status, 'status_changed',
       nullif(concat_ws(' | ', new.rejection_reason, time_note), ''));
  elsif new.status = 'rescheduled' and time_note is not null then
    insert into public.appointment_history
      (appointment_id, changed_by, old_status, new_status, action, notes)
    values
      (new.id, public.app_actor_id(), old.status, new.status, 'rescheduled', time_note);
  end if;
  return new;
end;
$$;

create trigger log_appointment_history_trigger
  after insert or update of status, start_datetime, end_datetime on public.appointments
  for each row execute function public.log_appointment_history();
