-- ===========================================================================
-- LCSS Phase 2 — 0002 RLS
-- Row Level Security: enabled on ALL application tables. No table is
-- publicly readable/writable; every policy is scoped to the authenticated
-- user (auth.uid()) and the trusted role from public.profiles via the
-- SECURITY DEFINER helpers in 0001 (never client-supplied).
--
-- Role model:
--   student  – own profile/rows, lecturer directory, own appointments
--              (create pending requests, cancel own), own notifications,
--              history of own appointments.
--   lecturer – own profile/rows, own availability (+exceptions), own
--              appointments (approve/reject/complete/…), own notifications,
--              own appointment history; can view student rows tied to their
--              appointments.
--   admin    – full management via public.is_admin().
-- The anon key grants nothing: all policies are TO authenticated.
-- ===========================================================================

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.students enable row level security;
alter table public.lecturers enable row level security;
alter table public.courses enable row level security;
alter table public.lecturer_courses enable row level security;
alter table public.availability enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.appointments enable row level security;
alter table public.notifications enable row level security;
alter table public.appointment_history enable row level security;

-- ===========================================================================
-- profiles
-- ===========================================================================
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

-- Lecturer/admin directory must be visible for booking & reporting.
create policy profiles_select_directory on public.profiles
  for select to authenticated using (role in ('lecturer', 'admin'));

-- Lecturers can resolve the profiles of students booked with them.
create policy profiles_select_own_students on public.profiles
  for select to authenticated using (
    exists (
      select 1
      from public.students s
      join public.appointments a on a.student_id = s.id
      join public.lecturers l on l.id = a.lecturer_id
      where s.profile_id = profiles.id
        and l.profile_id = auth.uid()
    )
  );

-- Public registration may only create student/lecturer profiles for self.
-- Admin accounts can only be created by an admin (or service_role seed).
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and role in ('student', 'lecturer'));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- NOTE: role changes by non-admins are rejected by the
-- prevent_role_escalation trigger (0001), not by this policy.

create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===========================================================================
-- students
-- ===========================================================================
create policy students_select_own on public.students
  for select to authenticated using (profile_id = auth.uid());

-- Lecturers can view student rows tied to their own appointments.
create policy students_select_counterparty on public.students
  for select to authenticated using (
    exists (
      select 1
      from public.appointments a
      join public.lecturers l on l.id = a.lecturer_id
      where a.student_id = students.id
        and l.profile_id = auth.uid()
    )
  );

create policy students_insert_own on public.students
  for insert to authenticated
  with check (profile_id = auth.uid());

create policy students_update_own on public.students
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy students_admin_all on public.students
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===========================================================================
-- lecturers
-- ---------------------------------------------------------------------------
-- The lecturer directory (search/filter) must be visible to students, so any
-- authenticated user can read lecturer rows; write access stays with the
-- owner and admins.
-- ===========================================================================
create policy lecturers_select_all on public.lecturers
  for select to authenticated using (true);

create policy lecturers_insert_own on public.lecturers
  for insert to authenticated
  with check (profile_id = auth.uid());

create policy lecturers_update_own on public.lecturers
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy lecturers_admin_all on public.lecturers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===========================================================================
-- departments / courses / lecturer_courses (reference data)
-- ===========================================================================
create policy departments_select_all on public.departments
  for select to authenticated using (true);

create policy departments_admin_all on public.departments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy courses_select_all on public.courses
  for select to authenticated using (true);

create policy courses_admin_all on public.courses
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy lecturer_courses_select_all on public.lecturer_courses
  for select to authenticated using (true);

create policy lecturer_courses_admin_all on public.lecturer_courses
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===========================================================================
-- availability / availability_exceptions
-- Students need to read active slots for future booking; only the owning
-- lecturer (or an admin) may write.
-- ===========================================================================
create policy availability_select_all on public.availability
  for select to authenticated using (true);

create policy availability_write_own on public.availability
  for all to authenticated
  using (public.is_admin() or lecturer_id = public.own_lecturer_id())
  with check (public.is_admin() or lecturer_id = public.own_lecturer_id());

create policy availability_exceptions_select_all on public.availability_exceptions
  for select to authenticated using (true);

create policy availability_exceptions_write_own on public.availability_exceptions
  for all to authenticated
  using (public.is_admin() or lecturer_id = public.own_lecturer_id())
  with check (public.is_admin() or lecturer_id = public.own_lecturer_id());

-- ===========================================================================
-- appointments
-- ===========================================================================
create policy appointments_select_parties on public.appointments
  for select to authenticated using (
    public.is_admin()
    or student_id = public.own_student_id()
    or lecturer_id = public.own_lecturer_id()
  );

-- Students create their own requests (always starting as pending); admins
-- may insert anything (e.g. data migration).
create policy appointments_insert_own on public.appointments
  for insert to authenticated
  with check (
    public.is_admin()
    or (student_id = public.own_student_id() and status = 'pending')
  );

-- Coarse ownership gate; fine-grained rules (student may only cancel own,
-- lecturer may not reassign/retime) are enforced by the
-- enforce_appointment_update_rules trigger in 0001.
create policy appointments_update_parties on public.appointments
  for update to authenticated
  using (
    public.is_admin()
    or student_id = public.own_student_id()
    or lecturer_id = public.own_lecturer_id()
  )
  with check (
    public.is_admin()
    or student_id = public.own_student_id()
    or lecturer_id = public.own_lecturer_id()
  );

create policy appointments_delete_admin on public.appointments
  for delete to authenticated using (public.is_admin());

-- ===========================================================================
-- notifications
-- ===========================================================================
create policy notifications_select_own on public.notifications
  for select to authenticated using (
    public.is_admin() or user_id = auth.uid()
  );

create policy notifications_insert_own_or_admin on public.notifications
  for insert to authenticated
  with check (public.is_admin() or user_id = auth.uid());
-- NOTE: system notifications are normally written by service_role / triggers,
-- which bypass RLS entirely.

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_delete_admin on public.notifications
  for delete to authenticated using (public.is_admin());

-- ===========================================================================
-- appointment_history (immutable audit trail)
-- Only parties (+admins) may read. Writes come exclusively from the
-- log_appointment_history trigger and service_role — no INSERT/UPDATE/
-- DELETE policies for authenticated users means default-deny.
-- ===========================================================================
create policy appointment_history_select_parties on public.appointment_history
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.appointments a
      where a.id = appointment_history.appointment_id
        and (
          a.student_id = public.own_student_id()
          or a.lecturer_id = public.own_lecturer_id()
        )
    )
  );
