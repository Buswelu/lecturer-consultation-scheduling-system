# LCSS — Supabase Database Foundation (Phase 2)

## Layout

```text
supabase/
├── migrations/
│   ├── 20260908000000_lcss_schema.sql  # tables, constraints, indexes, triggers, role helpers
│   └── 20260908000001_lcss_rls.sql     # RLS enable + all policies
├── seed.sql                            # demo data (idempotent, mirrors mock data)
└── README.md                           # this file
```

## 1. Create the project

1. Create a project at <https://supabase.com/dashboard>.
2. Copy `.env.example` → `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`
   and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API).
3. Until the env vars are set, the app keeps running on mock data.

## 2. Apply the schema

Dashboard → SQL Editor → New query, run in order:

1. `supabase/migrations/20260908000000_lcss_schema.sql`
2. `supabase/migrations/20260908000001_lcss_rls.sql`
3. `supabase/seed.sql` (demo data; password for all demo logins: `Lcss-Demo-1234`)

(Equivalently: `supabase db push` with the CLI, or `supabase db execute`.)

## 3. Verify RLS (do not skip)

Run these as checks after seeding. `auth.uid()`-dependent policies can be
verified per-role by signing in as each demo user in the app and confirming:

- **Student** (`john.mensah@schoolemail.edu`): sees only own appointments /
  notifications; can create a `pending` request; can cancel own request;
  cannot approve; cannot see other students' rows.
- **Lecturer** (`sarah.smith@university.edu`): sees own appointments +
  counterparty student rows; can approve/reject; can edit own availability;
  cannot edit another lecturer's availability or change own role.
- **Admin** (`admin@university.edu`): full read/write incl. departments,
  courses, users, appointments, reports data.

SQL-level spot checks (SQL editor, as `postgres`):

```sql
-- RLS is on everywhere (expect 11 × t):
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in
  ('profiles','departments','students','lecturers','courses',
   'lecturer_courses','availability','availability_exceptions',
   'appointments','notifications','appointment_history');

-- CHECK constraints reject bad enums:
insert into public.profiles (id, full_name, role)
values (gen_random_uuid(), 'Evil', 'superadmin');  -- must FAIL

insert into public.availability (lecturer_id, day_of_week, start_time, end_time)
values ((select id from public.lecturers limit 1), 9, '09:00', '08:00');  -- must FAIL

insert into public.appointments
  (student_id, lecturer_id, start_datetime, end_datetime, consultation_type, status, reason)
values
  ((select id from public.students limit 1),
   (select id from public.lecturers limit 1),
   now() + interval '1 day', now(), 'in_person', 'pending', 'bad range');  -- must FAIL
```

## 4. Regenerate types (optional)

```bash
npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
```

then diff against the hand-written version committed here.

## 5. Demo logins

| Role     | Email                        | Password       |
|----------|------------------------------|----------------|
| Admin    | admin@university.edu         | Lcss-Demo-1234 |
| Lecturer | sarah.smith@university.edu   | Lcss-Demo-1234 |
| Student  | john.mensah@schoolemail.edu  | Lcss-Demo-1234 |

⚠️ Demo-only credentials. Rotate/delete before any real use.
