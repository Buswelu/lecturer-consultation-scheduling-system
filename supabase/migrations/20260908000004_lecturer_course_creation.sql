-- ===========================================================================
-- LCSS — lecturer course creation
--
-- Lecturers need to create courses from `/lecturer/courses` so students can
-- discover them (courses + lecturer_courses are readable by every
-- authenticated user via `courses_select_all` / `lecturer_courses_select_all`).
-- Previously only admins could write these tables (`courses_admin_all` /
-- `lecturer_courses_admin_all`), so lecturer inserts were denied by RLS.
--
-- This migration adds permissive policies (OR-ed with the admin policies):
--   * authenticated lecturers may INSERT courses;
--   * lecturers may UPDATE courses currently assigned to them
--     (admins keep full access via the existing policy);
--   * lecturers may INSERT/DELETE their OWN lecturer_courses rows
--     (self-assign / unassign), enforced by own_lecturer_id().
--
-- Apply with: Supabase Dashboard → SQL Editor, or `supabase db push`.
-- Idempotent: drops policies if they already exist before re-creating.
-- ===========================================================================

-- Lecturers can create courses. Admins already covered by courses_admin_all.
drop policy if exists courses_insert_lecturer on public.courses;
create policy courses_insert_lecturer on public.courses
  for insert to authenticated
  with check (
    public.is_admin()
    or public.current_user_role() = 'lecturer'
  );

-- Lecturers can edit courses assigned to them (code/name/description/…).
drop policy if exists courses_update_own on public.courses;
create policy courses_update_own on public.courses
  for update to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.lecturer_courses lc
      where lc.course_id = courses.id
        and lc.lecturer_id = public.own_lecturer_id()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.lecturer_courses lc
      where lc.course_id = courses.id
        and lc.lecturer_id = public.own_lecturer_id()
    )
  );

-- Lecturers can assign themselves to courses (including ones just created).
drop policy if exists lecturer_courses_insert_own on public.lecturer_courses;
create policy lecturer_courses_insert_own on public.lecturer_courses
  for insert to authenticated
  with check (
    public.is_admin()
    or lecturer_id = public.own_lecturer_id()
  );

-- Lecturers can remove themselves from a course.
drop policy if exists lecturer_courses_delete_own on public.lecturer_courses;
create policy lecturer_courses_delete_own on public.lecturer_courses
  for delete to authenticated
  using (
    public.is_admin()
    or lecturer_id = public.own_lecturer_id()
  );
