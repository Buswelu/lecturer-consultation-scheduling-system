-- ===========================================================================
-- LCSS self-managed PostgreSQL — development scenario data (DEV ONLY)
--
-- Assigns every course to every lecturer and gives every lecturer a default
-- teaching week (Mon–Fri 09:00–12:00 + 14:00–16:00 Africa/Dar_es_Salaam wall
-- clock) so booking, approval, and calendar flows are testable end to end.
--
-- Idempotent and safe to re-run: assignments use ON CONFLICT DO NOTHING;
-- availability rows for existing lecturers are replaced wholesale (scoped
-- DELETE + INSERT inside one transaction). Run: npm run db:seed:dev
-- Requires provisioned lecturer accounts (see scripts/db/provision.mjs).
-- ===========================================================================

begin;

-- Every course visible to every lecturer (dev convenience only).
insert into public.lecturer_courses (lecturer_id, course_id)
select l.id, c.id
from public.lecturers l
cross join public.courses c
where c.is_active
on conflict do nothing;

-- Default teaching week for every lecturer (replaces prior dev rules).
delete from public.availability
where lecturer_id in (select id from public.lecturers);

insert into public.availability (lecturer_id, day_of_week, start_time, end_time, is_active)
select l.id, d.day_of_week, w.start_time, w.end_time, true
from public.lecturers l
cross join (values (1), (2), (3), (4), (5)) as d(day_of_week)
cross join (values ('09:00'::time, '12:00'::time), ('14:00'::time, '16:00'::time)) as w(start_time, end_time);

commit;
