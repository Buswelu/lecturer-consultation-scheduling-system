-- ===========================================================================
-- LCSS self-managed PostgreSQL — 007 appointment history + notifications
--
-- Ported from Supabase migration 20260908000000 with ONE deliberate change:
--   appointment_history.changed_by is NULLABLE (was NOT NULL).
-- Reason: the old trigger skipped rows with no authenticated actor
-- (auth.uid() IS NULL → RETURN NEW). The new trigger records the server
-- supplied actor (app.actor_id) and stores NULL for system/maintenance
-- writes, so the audit trail keeps the row instead of dropping it.
-- No RLS. Notifications are written by application services (the Supabase
-- notify_appointment_event trigger was intentionally not ported).
-- ===========================================================================

create table public.appointment_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  changed_by uuid references public.profiles (id),
  old_status text,
  new_status text,
  action text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index appointment_history_appointment_id_idx
  on public.appointment_history (appointment_id);

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

create index notifications_user_id_idx on public.notifications (user_id);
create index notifications_is_read_idx on public.notifications (is_read);
