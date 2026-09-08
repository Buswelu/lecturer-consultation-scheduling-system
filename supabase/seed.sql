-- ===========================================================================
-- LCSS Phase 2 — seed.sql : realistic development/demo data
--
-- Mirrors the frontend mock data (names, codes, programmes, availability)
-- so lecturer search, department/course filtering, availability views and
-- both dashboards can be exercised against real rows.
--
-- DEMO Auth users are created with password:  Lcss-Demo-1234
-- Change or delete these accounts before any real use.
--
-- Run AFTER the migrations, in the Supabase SQL Editor (or
-- `supabase db execute -f supabase/seed.sql`). Idempotent: safe to re-run.
-- ===========================================================================

begin;

create extension if not exists "pgcrypto";

-- All demo logins share one password hash (DO NOT use in production).
-- NOTE: crypt()/gen_salt() come from pgcrypto (enabled above).
select 'seeding LCSS demo data' as status;

-- ---------------------------------------------------------------------------
-- auth.users (demo logins; Supabase Auth owns this schema)
-- ---------------------------------------------------------------------------
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password,
   email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
   created_at, updated_at, is_sso_user, is_anonymous)
values
  -- admin
  ('50000000-0000-4000-8000-000000000001',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'admin@university.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  -- lecturers lec-1 … lec-9
  ('30000000-0000-4000-8000-000000000001',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'sarah.smith@university.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  ('30000000-0000-4000-8000-000000000002',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'james.okafor@university.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  ('30000000-0000-4000-8000-000000000003',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'emily.chen@university.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  ('30000000-0000-4000-8000-000000000004',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'michael.johnson@university.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  ('30000000-0000-4000-8000-000000000005',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'linda.mensah@university.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  ('30000000-0000-4000-8000-000000000006',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'robert.nkrumah@university.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  ('30000000-0000-4000-8000-000000000007',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'amara.diallo@university.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  ('30000000-0000-4000-8000-000000000008',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'henry.williams@university.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  ('30000000-0000-4000-8000-000000000009',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'nina.patel@university.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  -- students stud-1 … stud-6
  ('40000000-0000-4000-8000-000000000001',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'john.mensah@schoolemail.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  ('40000000-0000-4000-8000-000000000002',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'aisha.bello@schoolemail.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  ('40000000-0000-4000-8000-000000000003',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'kwame.osei@schoolemail.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  ('40000000-0000-4000-8000-000000000004',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'fatima.sani@schoolemail.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  ('40000000-0000-4000-8000-000000000005',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'david.boateng@schoolemail.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false),
  ('40000000-0000-4000-8000-000000000006',
   (select id from auth.instances limit 1), 'authenticated', 'authenticated',
   'grace.addo@schoolemail.edu', crypt('Lcss-Demo-1234', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), false, false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- departments (mirror of mock data)
-- ---------------------------------------------------------------------------
insert into public.departments (id, name, code, description, is_active)
values
  ('10000000-0000-4000-8000-000000000001', 'Computer Science', 'CS',
   'Studies of computation, information, and automation.', true),
  ('10000000-0000-4000-8000-000000000002', 'Mathematics', 'MATH',
   'The study of numbers, quantity, and space.', true),
  ('10000000-0000-4000-8000-000000000003', 'Engineering', 'ENG',
   'Application of science and math to solve problems.', true),
  ('10000000-0000-4000-8000-000000000004', 'Business Administration', 'BUS',
   'Management of businesses and organizations.', true),
  ('10000000-0000-4000-8000-000000000005', 'Design & Media', 'DES',
   'Creative and digital media studies.', true),
  ('10000000-0000-4000-8000-000000000006', 'Economics', 'ECON',
   'The study of production, distribution, and consumption.', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
insert into public.profiles (id, full_name, email, phone, avatar_url, role)
values
  ('50000000-0000-4000-8000-000000000001', 'System Administrator',
   'admin@university.edu', '+233 20 000 0000', null, 'admin'),
  ('30000000-0000-4000-8000-000000000001', 'Dr. Sarah Smith',
   'sarah.smith@university.edu', '+233 20 111 2222', '/avatars/avatar-1.svg', 'lecturer'),
  ('30000000-0000-4000-8000-000000000002', 'Prof. James Okafor',
   'james.okafor@university.edu', '+233 55 222 3333', '/avatars/avatar-2.svg', 'lecturer'),
  ('30000000-0000-4000-8000-000000000003', 'Dr. Emily Chen',
   'emily.chen@university.edu', '+233 27 333 4444', '/avatars/avatar-3.svg', 'lecturer'),
  ('30000000-0000-4000-8000-000000000004', 'Dr. Michael Johnson',
   'michael.johnson@university.edu', '+233 20 444 5555', '/avatars/avatar-4.svg', 'lecturer'),
  ('30000000-0000-4000-8000-000000000005', 'Dr. Linda Mensah',
   'linda.mensah@university.edu', '+233 24 555 6666', '/avatars/avatar-5.svg', 'lecturer'),
  ('30000000-0000-4000-8000-000000000006', 'Eng. Robert Nkrumah',
   'robert.nkrumah@university.edu', '+233 55 666 7777', '/avatars/avatar-6.svg', 'lecturer'),
  ('30000000-0000-4000-8000-000000000007', 'Dr. Amara Diallo',
   'amara.diallo@university.edu', '+233 20 777 8888', '/avatars/avatar-7.svg', 'lecturer'),
  ('30000000-0000-4000-8000-000000000008', 'Prof. Henry Williams',
   'henry.williams@university.edu', '+233 27 888 9999', '/avatars/avatar-8.svg', 'lecturer'),
  ('30000000-0000-4000-8000-000000000009', 'Dr. Nina Patel',
   'nina.patel@university.edu', '+233 24 999 0000', '/avatars/avatar-9.svg', 'lecturer'),
  ('40000000-0000-4000-8000-000000000001', 'John Mensah',
   'john.mensah@schoolemail.edu', '+233 20 123 4567', null, 'student'),
  ('40000000-0000-4000-8000-000000000002', 'Aisha Bello',
   'aisha.bello@schoolemail.edu', '+233 24 234 5678', null, 'student'),
  ('40000000-0000-4000-8000-000000000003', 'Kwame Osei',
   'kwame.osei@schoolemail.edu', '+233 55 345 6789', null, 'student'),
  ('40000000-0000-4000-8000-000000000004', 'Fatima Sani',
   'fatima.sani@schoolemail.edu', '+233 27 456 7890', null, 'student'),
  ('40000000-0000-4000-8000-000000000005', 'David Boateng',
   'david.boateng@schoolemail.edu', '+233 20 567 8901', null, 'student'),
  ('40000000-0000-4000-8000-000000000006', 'Grace Addo',
   'grace.addo@schoolemail.edu', '+233 24 678 9012', null, 'student')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- lecturers
-- ---------------------------------------------------------------------------
insert into public.lecturers
  (id, profile_id, staff_number, department_id, office, bio)
values
  ('60000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001', 'LF2008003',
   '10000000-0000-4000-8000-000000000001', 'CS Building, Room 304',
   'Senior lecturer in Computer Science. Research focuses on database systems and data management.'),
  ('60000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000002', 'LF2005001',
   '10000000-0000-4000-8000-000000000001', 'CS Building, Room 210',
   'Professor of Computer Science specializing in algorithms and data structures.'),
  ('60000000-0000-4000-8000-000000000003',
   '30000000-0000-4000-8000-000000000003', 'LF2010002',
   '10000000-0000-4000-8000-000000000001', 'CS Building, Room 118',
   'Lecturer in Artificial Intelligence and Machine Learning.'),
  ('60000000-0000-4000-8000-000000000004',
   '30000000-0000-4000-8000-000000000004', 'LF2009004',
   '10000000-0000-4000-8000-000000000002', 'Math Building, Room 402',
   'Senior Lecturer in Mathematics with a focus on calculus and statistics.'),
  ('60000000-0000-4000-8000-000000000005',
   '30000000-0000-4000-8000-000000000005', 'LF2012005',
   '10000000-0000-4000-8000-000000000002', 'Math Building, Room 305',
   'Lecturer in Probability and Statistics.'),
  ('60000000-0000-4000-8000-000000000006',
   '30000000-0000-4000-8000-000000000006', 'LF2006001',
   '10000000-0000-4000-8000-000000000003', 'Engineering Block, Room 108',
   'Senior Lecturer in Electrical Engineering; teaches digital circuits.'),
  ('60000000-0000-4000-8000-000000000007',
   '30000000-0000-4000-8000-000000000007', 'LF2013006',
   '10000000-0000-4000-8000-000000000003', 'Engineering Block, Room 215',
   'Lecturer in Thermal Engineering; research in renewable energy systems.'),
  ('60000000-0000-4000-8000-000000000008',
   '30000000-0000-4000-8000-000000000008', 'LF2004007',
   '10000000-0000-4000-8000-000000000004', 'Business School, Room 501',
   'Professor of Business Administration; teaches organizational management.'),
  ('60000000-0000-4000-8000-000000000009',
   '30000000-0000-4000-8000-000000000009', 'LF2015008',
   '10000000-0000-4000-8000-000000000005', 'Design Studio, Room 203',
   'Lecturer in User Experience Design.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------
insert into public.students
  (id, profile_id, student_number, programme, department_id, year_of_study)
values
  ('70000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', 'ST20210045', 'BSc Computer Science',
   '10000000-0000-4000-8000-000000000001', 3),
  ('70000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000002', 'ST20210112', 'BSc Computer Science',
   '10000000-0000-4000-8000-000000000001', 2),
  ('70000000-0000-4000-8000-000000000003',
   '40000000-0000-4000-8000-000000000003', 'ST20210378', 'BSc Mathematics',
   '10000000-0000-4000-8000-000000000002', 4),
  ('70000000-0000-4000-8000-000000000004',
   '40000000-0000-4000-8000-000000000004', 'ST20210089', 'BEng Electrical Engineering',
   '10000000-0000-4000-8000-000000000003', 3),
  ('70000000-0000-4000-8000-000000000005',
   '40000000-0000-4000-8000-000000000005', 'ST20210234', 'BBA Management',
   '10000000-0000-4000-8000-000000000004', 2),
  ('70000000-0000-4000-8000-000000000006',
   '40000000-0000-4000-8000-000000000006', 'ST20200345', 'BSc Computer Science',
   '10000000-0000-4000-8000-000000000001', 1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- courses (mirror of mock data)
-- ---------------------------------------------------------------------------
insert into public.courses (id, code, name, description, department_id, is_active)
values
  ('20000000-0000-4000-8000-000000000001', 'CS301', 'Database Systems',
   'Fundamentals of database design and SQL.',
   '10000000-0000-4000-8000-000000000001', true),
  ('20000000-0000-4000-8000-000000000002', 'CS202', 'Algorithms & Data Structures',
   'Core algorithms and data structures.',
   '10000000-0000-4000-8000-000000000001', true),
  ('20000000-0000-4000-8000-000000000003', 'CS480', 'Artificial Intelligence',
   'Introduction to modern AI techniques.',
   '10000000-0000-4000-8000-000000000001', true),
  ('20000000-0000-4000-8000-000000000004', 'MATH201', 'Calculus II',
   'Integral and multivariable calculus.',
   '10000000-0000-4000-8000-000000000002', true),
  ('20000000-0000-4000-8000-000000000005', 'MATH245', 'Probability & Statistics',
   'Statistical analysis and probability theory.',
   '10000000-0000-4000-8000-000000000002', true),
  ('20000000-0000-4000-8000-000000000006', 'ENG210', 'Digital Circuits',
   'Digital logic design and circuits.',
   '10000000-0000-4000-8000-000000000003', true),
  ('20000000-0000-4000-8000-000000000007', 'ENG330', 'Thermodynamics',
   'Principles of thermodynamics and energy.',
   '10000000-0000-4000-8000-000000000003', true),
  ('20000000-0000-4000-8000-000000000008', 'BUS205', 'Organizational Management',
   'Principles of organizational behavior and management.',
   '10000000-0000-4000-8000-000000000004', true),
  ('20000000-0000-4000-8000-000000000009', 'DES310', 'User Experience Design',
   'Human-centered design and usability.',
   '10000000-0000-4000-8000-000000000005', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- lecturer_courses (mirror of mock lecturerIds)
-- ---------------------------------------------------------------------------
insert into public.lecturer_courses (lecturer_id, course_id)
values
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'),
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000005'),
  ('60000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005'),
  ('60000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006'),
  ('60000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000007'),
  ('60000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000008'),
  ('60000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000009')
on conflict (lecturer_id, course_id) do nothing;

-- ---------------------------------------------------------------------------
-- availability (day_of_week: 1=Mon … 5=Fri; mirrors mock rules)
-- ---------------------------------------------------------------------------
insert into public.availability
  (id, lecturer_id, day_of_week, start_time, end_time, is_active)
values
  ('90000000-0000-4000-8000-000000000001',
   '60000000-0000-4000-8000-000000000001', 1, '09:00', '12:00', true),
  ('90000000-0000-4000-8000-000000000002',
   '60000000-0000-4000-8000-000000000001', 3, '14:00', '16:00', true),
  ('90000000-0000-4000-8000-000000000003',
   '60000000-0000-4000-8000-000000000001', 5, '09:00', '11:00', true),
  ('90000000-0000-4000-8000-000000000004',
   '60000000-0000-4000-8000-000000000002', 2, '09:00', '12:00', true),
  ('90000000-0000-4000-8000-000000000005',
   '60000000-0000-4000-8000-000000000002', 4, '13:00', '17:00', true),
  ('90000000-0000-4000-8000-000000000006',
   '60000000-0000-4000-8000-000000000003', 1, '10:00', '13:00', true),
  ('90000000-0000-4000-8000-000000000007',
   '60000000-0000-4000-8000-000000000003', 4, '14:00', '17:00', true),
  ('90000000-0000-4000-8000-000000000008',
   '60000000-0000-4000-8000-000000000004', 1, '09:00', '11:30', true),
  ('90000000-0000-4000-8000-000000000009',
   '60000000-0000-4000-8000-000000000004', 3, '09:00', '12:00', true),
  ('90000000-0000-4000-8000-000000000010',
   '60000000-0000-4000-8000-000000000005', 5, '09:00', '12:00', true),
  ('90000000-0000-4000-8000-000000000011',
   '60000000-0000-4000-8000-000000000006', 2, '13:00', '16:00', true),
  ('90000000-0000-4000-8000-000000000012',
   '60000000-0000-4000-8000-000000000006', 5, '09:00', '11:30', true),
  ('90000000-0000-4000-8000-000000000013',
   '60000000-0000-4000-8000-000000000007', 1, '14:00', '17:00', true),
  ('90000000-0000-4000-8000-000000000014',
   '60000000-0000-4000-8000-000000000008', 3, '10:00', '13:00', true),
  ('90000000-0000-4000-8000-000000000015',
   '60000000-0000-4000-8000-000000000009', 4, '09:00', '12:00', true)
on conflict (id) do nothing;

commit;

-- Quick sanity counts (visible in the SQL editor output).
select 'departments' as tbl, count(*) from public.departments
union all select 'courses', count(*) from public.courses
union all select 'profiles', count(*) from public.profiles
union all select 'lecturers', count(*) from public.lecturers
union all select 'students', count(*) from public.students
union all select 'lecturer_courses', count(*) from public.lecturer_courses
union all select 'availability', count(*) from public.availability;
