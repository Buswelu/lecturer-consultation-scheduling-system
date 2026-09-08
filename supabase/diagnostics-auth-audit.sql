-- ===========================================================================
-- LCSS — Auth/data consistency audit (READ-ONLY, safe to run any time)
--
-- Run in: Supabase Dashboard → SQL Editor (in the SAME project you view
-- under Authentication → Users). Compares public.profiles against
-- auth.users and reports exactly which records match.
--
-- IMPORTANT: also compare the project ref in your Dashboard URL
-- (.../dashboard/project/<REF>) with the ref in the app's .env.local
-- (NEXT_PUBLIC_SUPABASE_URL=https://<REF>.supabase.co). If they differ,
-- you are looking at two different projects — that alone explains any
-- Users-list vs SQL discrepancy.
-- ===========================================================================

-- 0. Which database is this?
select current_database() as database, now() as checked_at;

-- 1. Auth users visible to the Auth system (what Dashboard SHOULD show).
select id, email,
  (email_confirmed_at is not null) as confirmed,
  created_at
from auth.users
order by created_at;

-- 2. Application profiles.
select id, email, role from public.profiles order by email;

-- 3. Match report: every profile vs its auth user (THE key diagnostic).
select
  p.email as profile_email,
  p.role,
  p.id as profile_id,
  u.id as auth_id,
  case
    when u.id is null then 'MISSING auth.users row'
    when u.id = p.id then 'MATCH'
    else 'ID MISMATCH'
  end as status
from public.profiles p
left join auth.users u on u.id = p.id
order by status, profile_email;

-- 4. Reverse: auth users with no profile row.
select u.email, u.id as auth_id
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- 5. students/lecturers linkage integrity.
select 'students' as tbl, count(*) as total,
  count(*) filter (where p.id is not null) as with_profile
from public.students s
left join public.profiles p on p.id = s.profile_id
union all
select 'lecturers', count(*),
  count(*) filter (where p.id is not null)
from public.lecturers l
left join public.profiles p on p.id = l.profile_id;

-- 6. Overlap trigger present? (Phase 4 migration 20260908000002)
select tgname as trigger_name
from pg_trigger
where tgname = 'prevent_availability_overlap_trigger';

-- 7. RLS still enabled on all app tables? (expect zero rows here)
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles', 'departments', 'students', 'lecturers', 'courses',
    'lecturer_courses', 'availability', 'availability_exceptions',
    'appointments', 'notifications', 'appointment_history'
  )
  and rowsecurity = false;
