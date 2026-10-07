-- ===========================================================================
-- LCSS self-managed PostgreSQL — 004 academic data
--
-- Ported 1:1 from Supabase migration 20260908000000: departments, students,
-- lecturers, courses, lecturer_courses with identical columns, foreign keys,
-- unique constraints, check constraints, indexes and updated_at triggers.
-- No Supabase Auth references exist in these tables. No RLS is created:
-- read/write rules are enforced server-side in Next.js.
-- ===========================================================================

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at_departments
  before update on public.departments
  for each row execute function public.set_updated_at();

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

create index students_profile_id_idx on public.students (profile_id);
create index students_department_id_idx on public.students (department_id);

create trigger set_updated_at_students
  before update on public.students
  for each row execute function public.set_updated_at();

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

create index lecturers_profile_id_idx on public.lecturers (profile_id);
create index lecturers_department_id_idx on public.lecturers (department_id);

create trigger set_updated_at_lecturers
  before update on public.lecturers
  for each row execute function public.set_updated_at();

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

create index courses_department_id_idx on public.courses (department_id);

create trigger set_updated_at_courses
  before update on public.courses
  for each row execute function public.set_updated_at();

create table public.lecturer_courses (
  id uuid primary key default gen_random_uuid(),
  lecturer_id uuid not null references public.lecturers (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (lecturer_id, course_id)
);

create index lecturer_courses_lecturer_id_idx on public.lecturer_courses (lecturer_id);
create index lecturer_courses_course_id_idx on public.lecturer_courses (course_id);
