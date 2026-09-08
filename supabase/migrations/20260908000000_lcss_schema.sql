-- ===========================================================================
-- LCSS Phase 2 — 0001 schema
-- Lecturer Consultation Scheduling System: core tables, constraints,
-- indexes, and shared triggers/helpers.
--
-- Apply with: Supabase Dashboard → SQL Editor, or `supabase db push`.
-- Tables use UUID primary keys (`gen_random_uuid()`), snake_case columns,
-- TIMESTAMPTZ timestamps, and CHECK constraints for all enums.
-- Row Level Security policies live in 0002_rls.sql.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per Supabase Auth user. id MUST equal auth.users.id.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  avatar_url text,
  role text not null
    check (role in ('student', 'lecturer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  student_number text unique,
  programme text,
  department_id uuid references public.departments (id) on delete set null,
  year_of_study integer check (year_of_study is null or year_of_study >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- lecturers
-- ---------------------------------------------------------------------------
create table public.lecturers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  staff_number text unique,
  department_id uuid references public.departments (id) on delete set null,
  office text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  department_id uuid references public.departments (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- lecturer_courses: many-to-many assignments
-- ---------------------------------------------------------------------------
create table public.lecturer_courses (
  id uuid primary key default gen_random_uuid(),
  lecturer_id uuid not null references public.lecturers (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (lecturer_id, course_id)
);

-- ---------------------------------------------------------------------------
-- availability: recurring weekly availability (0=Sunday … 6=Saturday,
-- matching PostgreSQL EXTRACT(DOW …)).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- availability_exceptions: one-off unavailable periods (leave, meetings…).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------
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
  -- NOTE: double-booking prevention is intentionally NOT implemented here;
  -- it belongs to the Phase 3 scheduling-logic work.
);

-- ---------------------------------------------------------------------------
-- notifications (user_id references the profile/auth user)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  message text not null,
  type text check (type in (
    'appointment_request', 'appointment_approved', 'appointment_rejected',
    'appointment_cancelled', 'appointment_rescheduled',
    'appointment_reminder', 'system'
  )),
  is_read boolean not null default false,
  appointment_id uuid references public.appointments (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- appointment_history: immutable audit trail of appointment lifecycle events
-- ---------------------------------------------------------------------------
create table public.appointment_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  changed_by uuid not null references public.profiles (id),
  old_status text,
  new_status text,
  action text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- Indexes (spec §17)
-- ===========================================================================
create index profiles_role_idx on public.profiles (role);

create index students_profile_id_idx on public.students (profile_id);
create index students_department_id_idx on public.students (department_id);

create index lecturers_profile_id_idx on public.lecturers (profile_id);
create index lecturers_department_id_idx on public.lecturers (department_id);

create index courses_department_id_idx on public.courses (department_id);

create index lecturer_courses_lecturer_id_idx on public.lecturer_courses (lecturer_id);
create index lecturer_courses_course_id_idx on public.lecturer_courses (course_id);

create index availability_lecturer_id_idx on public.availability (lecturer_id);
create index availability_day_of_week_idx on public.availability (day_of_week);

create index availability_exceptions_lecturer_id_idx on public.availability_exceptions (lecturer_id);
create index availability_exceptions_start_datetime_idx on public.availability_exceptions (start_datetime);

create index appointments_student_id_idx on public.appointments (student_id);
create index appointments_lecturer_id_idx on public.appointments (lecturer_id);
create index appointments_course_id_idx on public.appointments (course_id);
create index appointments_start_datetime_idx on public.appointments (start_datetime);
create index appointments_status_idx on public.appointments (status);

create index notifications_user_id_idx on public.notifications (user_id);
create index notifications_is_read_idx on public.notifications (is_read);

create index appointment_history_appointment_id_idx on public.appointment_history (appointment_id);

-- ===========================================================================
-- Shared triggers & role helpers
-- ===========================================================================

-- Auto-maintain updated_at on every row change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at_departments
  before update on public.departments
  for each row execute function public.set_updated_at();
create trigger set_updated_at_students
  before update on public.students
  for each row execute function public.set_updated_at();
create trigger set_updated_at_lecturers
  before update on public.lecturers
  for each row execute function public.set_updated_at();
create trigger set_updated_at_courses
  before update on public.courses
  for each row execute function public.set_updated_at();
create trigger set_updated_at_availability
  before update on public.availability
  for each row execute function public.set_updated_at();
create trigger set_updated_at_availability_exceptions
  before update on public.availability_exceptions
  for each row execute function public.set_updated_at();
create trigger set_updated_at_appointments
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- Trusted role helpers. SECURITY DEFINER so they read `profiles` without
-- recursing into RLS policies; the role NEVER comes from client input.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Convenience lookups used by RLS policies and service code.
create or replace function public.own_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.students where profile_id = auth.uid();
$$;

create or replace function public.own_lecturer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.lecturers where profile_id = auth.uid();
$$;

-- Block privilege escalation: only admins may change a profile's role.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only administrators can change user roles.';
  end if;
  return new;
end;
$$;

create trigger prevent_role_escalation_profiles
  before update of role on public.profiles
  for each row execute function public.prevent_role_escalation();

-- Auto-append to the audit trail whenever an appointment is created or its
-- status changes. Skips rows with no authenticated actor (service_role
-- imports) because changed_by is NOT NULL.
create or replace function public.log_appointment_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    insert into public.appointment_history
      (appointment_id, changed_by, old_status, new_status, action)
    values
      (new.id, auth.uid(), null, new.status, 'created');
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.appointment_history
      (appointment_id, changed_by, old_status, new_status, action, notes)
    values
      (new.id, auth.uid(), old.status, new.status, 'status_changed', new.rejection_reason);
  end if;
  return new;
end;
$$;

create trigger log_appointment_history_trigger
  after insert or update of status on public.appointments
  for each row execute function public.log_appointment_history();

-- Phase-2 update guard for appointments (DB-level enforcement behind RLS):
--  * admins: unrestricted;
--  * owning students: may only cancel their own request (status → cancelled),
--    all other columns immutable;
--  * owning lecturers: may change status / notes / location / meeting_link /
--    rejection_reason on their own appointments; identities and times are
--    immutable until the Phase 3 rescheduling transaction lands.
create or replace function public.enforce_appointment_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_student uuid := public.own_student_id();
  caller_lecturer uuid := public.own_lecturer_id();
begin
  if public.is_admin() then
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
    if new.student_id is not distinct from old.student_id
       and new.lecturer_id is not distinct from old.lecturer_id
       and new.course_id is not distinct from old.course_id
       and new.start_datetime is not distinct from old.start_datetime
       and new.end_datetime is not distinct from old.end_datetime
       and new.consultation_type is not distinct from old.consultation_type
       and new.reason is not distinct from old.reason
       and new.status in ('approved', 'rejected', 'completed', 'cancelled', 'rescheduled', 'no_show') then
      return new;
    end if;
    raise exception 'Lecturers cannot reassign or retime appointments in this phase.';
  end if;

  raise exception 'Not authorized to modify this appointment.';
end;
$$;

create trigger enforce_appointment_update_rules_trigger
  before update on public.appointments
  for each row execute function public.enforce_appointment_update_rules();
