-- ===========================================================================
-- LCSS — profile full_name audit + safe fix (Phase 3 identity flow)
--
-- Run in: Supabase Dashboard → SQL Editor. The SELECTs are read-only.
-- The UPDATE at the bottom is commented out: review the audit output
-- first, then uncomment and fill in ONE email + name at a time.
-- No deletes, no role changes (the role-escalation trigger is unaffected
-- by full_name-only updates).
-- ===========================================================================

-- 1. Registration chain audit: auth user → metadata name → profile name.
select
  u.id,
  u.email,
  u.raw_user_meta_data->>'full_name' as auth_full_name,
  p.full_name as profile_full_name,
  p.role
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc;

-- 2. Find suspicious placeholders (accounts needing a fix).
select id, email, full_name, role
from public.profiles
where full_name is null
   or full_name = ''
   or full_name = 'New User';

-- 3. Safe targeted fix (uncomment, fill in, run once per account).
-- update public.profiles
-- set full_name = 'Correct Full Name',
--     updated_at = now()
-- where email = 'user@example.com';
