-- ===========================================================================
-- LCSS self-managed PostgreSQL — 009 login identifiers
--
-- Primary login handle becomes a system-generated registration/staff number
-- stored on users.username (one namespace for all roles, prefixes prevent
-- ambiguity: STU-YYYY-NNNN / LEC-YYYY-NNNN / ADM-NNNN). Email stays as
-- recovery address + backup login. Sequences guarantee concurrency-safe
-- uniqueness (never Math.random(), never client-generated).
--
-- students.student_number / lecturers.staff_number mirror the username for
-- the matching role (domain model consistency) and become NOT NULL.
-- Existing development rows are backfilled with generated identifiers.
-- ===========================================================================

create sequence public.student_number_seq start 1;
create sequence public.lecturer_number_seq start 1;
create sequence public.admin_number_seq start 1;

alter table public.users add column username citext;

-- Backfill existing rows from the sequences (one value per row, in order).
with numbered as (
  select u.id,
    ('STU-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.student_number_seq')::text, 4, '0'))::citext as uname
  from public.users u
  join public.profiles p on p.id = u.id
  where p.role = 'student' and u.username is null
)
update public.users u set username = n.uname from numbered n where u.id = n.id;

with numbered as (
  select u.id,
    ('LEC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.lecturer_number_seq')::text, 4, '0'))::citext as uname
  from public.users u
  join public.profiles p on p.id = u.id
  where p.role = 'lecturer' and u.username is null
)
update public.users u set username = n.uname from numbered n where u.id = n.id;

with numbered as (
  select u.id,
    ('ADM-' || lpad(nextval('public.admin_number_seq')::text, 4, '0'))::citext as uname
  from public.users u
  join public.profiles p on p.id = u.id
  where p.role = 'admin' and u.username is null
)
update public.users u set username = n.uname from numbered n where u.id = n.id;

-- Mirror onto the detail rows for the matching role.
update public.students s
set student_number = u.username::text
from public.users u join public.profiles p on p.id = u.id
where s.profile_id = u.id and p.role = 'student' and s.student_number is null;

update public.lecturers l
set staff_number = u.username::text
from public.users u join public.profiles p on p.id = u.id
where l.profile_id = u.id and p.role = 'lecturer' and l.staff_number is null;

-- Enforce: unique, required, well-formed (prefix namespaces are disjoint).
alter table public.users add constraint users_username_unique unique (username);
alter table public.users alter column username set not null;
alter table public.users add constraint users_username_format
  check (username::text ~ '^(STU-[0-9]{4}-[0-9]{4,}|LEC-[0-9]{4}-[0-9]{4,}|ADM-[0-9]{4,})$');

alter table public.students alter column student_number set not null;
alter table public.lecturers alter column staff_number set not null;
