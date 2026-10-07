-- ===========================================================================
-- LCSS self-managed PostgreSQL — development seed (idempotent, safe to re-run)
--
-- Seeds reference data ONLY: departments + courses. Lecturer assignments,
-- profiles, availability and appointments need real users, which are created
-- through the application authentication system (later stage) — never by
-- inserting into auth internals (auth.users no longer exists).
-- Run: npm run db:seed
-- ===========================================================================

insert into public.departments (name, code, description) values
  ('Computer Science', 'COMP', 'Computing, software and information systems'),
  ('Mathematics', 'MATH', 'Pure and applied mathematics'),
  ('Physics', 'PHY', 'Physics and electronics'),
  ('Business Administration', 'BUSA', 'Management, accounting and marketing')
on conflict (name) do nothing;

insert into public.courses (code, name, description, department_id, credits) values
  ('COMP 101', 'Introduction to Programming', 'Programming fundamentals', (select id from public.departments where code = 'COMP'), 3),
  ('COMP 201', 'Data Structures', 'Lists, trees, graphs and algorithms', (select id from public.departments where code = 'COMP'), 3),
  ('COMP 301', 'Database Systems', 'Relational design and SQL', (select id from public.departments where code = 'COMP'), 4),
  ('MATH 101', 'Calculus I', 'Limits, derivatives and integrals', (select id from public.departments where code = 'MATH'), 3),
  ('MATH 201', 'Linear Algebra', 'Vectors, matrices and systems', (select id from public.departments where code = 'MATH'), 3),
  ('PHY 101', 'General Physics', 'Mechanics and thermodynamics', (select id from public.departments where code = 'PHY'), 4),
  ('BUSA 101', 'Principles of Management', 'Foundations of management', (select id from public.departments where code = 'BUSA'), 3),
  ('BUSA 201', 'Financial Accounting', 'Statements and bookkeeping', (select id from public.departments where code = 'BUSA'), 3)
-- DO NOTHING (not DO UPDATE): re-seeding must never clobber admin-edited credits.
on conflict (code) do nothing;
