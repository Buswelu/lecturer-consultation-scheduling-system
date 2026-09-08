-- ===========================================================================
-- LCSS Phase 5 — 0003 appointment booking
--
-- 1. Atomic double-booking protection: partial GiST exclusion constraint.
--    Only ACTIVE statuses (pending/approved/rescheduled) participate, so
--    cancelled/rejected/completed/no-show rows never block. Ranges are
--    half-open [start, end): adjacent appointments (10:00–10:30 +
--    10:30–11:00) do NOT conflict; identical or partial overlaps do.
--    Semantics verified empirically (PGlite + btree_gist) before writing:
--    identical/partial overlaps rejected (23P01), adjacency allowed,
--    non-active rows ignored, status-only UPDATEs do not self-conflict,
--    retime-into-conflict rejected, lecturer-scoped.
-- 2. `enforce_appointment_update_rules`: owning lecturers may now retime
--    when (and only when) moving to `rescheduled` from
--    pending/approved/rescheduled. Everything else unchanged.
-- 3. `log_appointment_history`: retime details appended to notes.
-- 4. `notify_appointment_event`: automatic in-app notifications for both
--    parties on create + every status transition (SECURITY DEFINER, so no
--    client RLS change is needed and clients never insert notifications).
--
-- BEFORE APPLYING: list pre-existing conflicting ACTIVE rows (they would
-- block the constraint). Resolve (cancel/retime) any rows returned:
--
--   select a1.id as first_id, a2.id as second_id,
--          a1.lecturer_id, a1.start_datetime, a1.end_datetime
--   from public.appointments a1
--   join public.appointments a2
--     on a1.lecturer_id = a2.lecturer_id
--    and a1.id < a2.id
--    and tstzrange(a1.start_datetime, a1.end_datetime)
--        && tstzrange(a2.start_datetime, a2.end_datetime)
--   where a1.status in ('pending', 'approved', 'rescheduled')
--     and a2.status in ('pending', 'approved', 'rescheduled');
--
-- No RLS policies are added, removed, or weakened by this migration.
-- Apply with: Supabase Dashboard → SQL Editor (after 0000–0002).
-- ===========================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- 1. Double-booking protection
-- ---------------------------------------------------------------------------
alter table public.appointments
  drop constraint if exists appointments_no_double_booking;

alter table public.appointments
  add constraint appointments_no_double_booking
  exclude using gist (
    lecturer_id with =,
    tstzrange(start_datetime, end_datetime) with &&
  )
  where (status in ('pending', 'approved', 'rescheduled'));

-- ---------------------------------------------------------------------------
-- 2. Allow owning lecturers to retime when rescheduling
-- ---------------------------------------------------------------------------
create or replace function public.enforce_appointment_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_student uuid := public.own_student_id();
  caller_lecturer uuid := public.own_lecturer_id();
  times_unchanged boolean;
  retime_allowed boolean;
begin
  if public.is_admin() then
    return new;
  end if;

  -- Owning students: cancel only, everything else immutable (unchanged).
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
    -- Retiming is a reschedule: new status must be `rescheduled` and the
    -- appointment must come from a live state (never a terminal one).
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

drop trigger if exists enforce_appointment_update_rules_trigger on public.appointments;

create trigger enforce_appointment_update_rules_trigger
  before update on public.appointments
  for each row execute function public.enforce_appointment_update_rules();

-- ---------------------------------------------------------------------------
-- 3. History entries record retimed slots
-- ---------------------------------------------------------------------------
create or replace function public.log_appointment_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  time_note text := null;
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
      (new.id, auth.uid(), old.status, new.status, 'status_changed',
       nullif(concat_ws(' | ', new.rejection_reason, time_note), ''));
  elsif new.status = 'rescheduled' and time_note is not null then
    -- Retime without a status change (already rescheduled): still audit it.
    insert into public.appointment_history
      (appointment_id, changed_by, old_status, new_status, action, notes)
    values
      (new.id, auth.uid(), old.status, new.status, 'rescheduled', time_note);
  end if;
  return new;
end;
$$;

drop trigger if exists log_appointment_history_trigger on public.appointments;

create trigger log_appointment_history_trigger
  after insert or update of status, start_datetime, end_datetime on public.appointments
  for each row execute function public.log_appointment_history();

-- ---------------------------------------------------------------------------
-- 4. Automatic in-app notifications for both parties
-- ---------------------------------------------------------------------------
create or replace function public.notify_appointment_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  student_profile uuid;
  lecturer_profile uuid;
  student_name text;
  lecturer_name text;
  time_label text;
  recipient uuid;
  title text;
  message text;
  ntype text;
begin
  if actor is null then
    return new;
  end if;

  select st.profile_id into student_profile
  from public.students st where st.id = new.student_id;

  select le.profile_id, p.full_name into lecturer_profile, lecturer_name
  from public.lecturers le
  join public.profiles p on p.id = le.profile_id
  where le.id = new.lecturer_id;

  select p.full_name into student_name
  from public.profiles p where p.id = student_profile;

  time_label :=
    to_char(new.start_datetime at time zone 'Africa/Dar_es_Salaam', 'DD Mon YYYY, HH24:MI')
    || ' – '
    || to_char(new.end_datetime at time zone 'Africa/Dar_es_Salaam', 'HH24:MI')
    || ' (EAT)';

  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, title, message, type, appointment_id)
    values
      (lecturer_profile, 'New consultation request',
       coalesce(student_name, 'A student')
       || ' requested a consultation on ' || time_label
       || '. Reason: ' || left(new.reason, 140),
       'appointment_request', new.id),
      (student_profile, 'Request submitted',
       'Your consultation request with ' || coalesce(lecturer_name, 'your lecturer')
       || ' on ' || time_label || ' is pending review.',
       'appointment_request', new.id);
    return new;
  end if;

  -- UPDATE path: status change, or a reschedule retime without one.
  if not (new.status is distinct from old.status
          or (new.status = 'rescheduled'
              and (new.start_datetime is distinct from old.start_datetime
                   or new.end_datetime is distinct from old.end_datetime))) then
    return new;
  end if;

  case new.status
    when 'approved' then
      recipient := student_profile;
      title := 'Consultation approved';
      message := 'Your consultation with ' || coalesce(lecturer_name, 'your lecturer')
        || ' on ' || time_label || ' has been approved.'
        || coalesce(' Location: ' || new.location, '')
        || coalesce(' Meeting link: ' || new.meeting_link, '');
      ntype := 'appointment_approved';
    when 'rejected' then
      recipient := student_profile;
      title := 'Consultation request rejected';
      message := 'Your consultation request with ' || coalesce(lecturer_name, 'your lecturer')
        || ' on ' || time_label || ' was not approved.'
        || coalesce(' Reason: ' || new.rejection_reason, '');
      ntype := 'appointment_rejected';
    when 'cancelled' then
      if actor = student_profile then
        recipient := lecturer_profile;
        message := coalesce(student_name, 'The student')
          || ' cancelled the consultation on ' || time_label || '.';
      else
        recipient := student_profile;
        message := 'Your consultation with ' || coalesce(lecturer_name, 'your lecturer')
          || ' on ' || time_label || ' was cancelled.';
      end if;
      title := 'Consultation cancelled';
      ntype := 'appointment_cancelled';
    when 'rescheduled' then
      recipient := student_profile;
      title := 'Consultation rescheduled';
      message := 'Your consultation with ' || coalesce(lecturer_name, 'your lecturer')
        || ' was moved to ' || time_label || '.';
      ntype := 'appointment_rescheduled';
    when 'completed' then
      recipient := student_profile;
      title := 'Consultation completed';
      message := 'Your consultation with ' || coalesce(lecturer_name, 'your lecturer')
        || ' on ' || time_label || ' was marked as completed.';
      ntype := 'system';
    when 'no_show' then
      recipient := student_profile;
      title := 'Marked as no-show';
      message := 'You were marked as no-show for your consultation with '
        || coalesce(lecturer_name, 'your lecturer') || ' on ' || time_label || '.';
      ntype := 'system';
    else
      return new;
  end case;

  insert into public.notifications (user_id, title, message, type, appointment_id)
  values (recipient, title, message, ntype, new.id);
  return new;
end;
$$;

drop trigger if exists notify_appointment_event_trigger on public.appointments;

create trigger notify_appointment_event_trigger
  after insert or update of status, start_datetime, end_datetime on public.appointments
  for each row execute function public.notify_appointment_event();
