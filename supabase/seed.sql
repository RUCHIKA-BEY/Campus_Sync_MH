-- =====================================================================
-- CampusSync development seed data — FICTIONAL, for local/dev only.
-- ---------------------------------------------------------------------
-- Do NOT run this against production.
-- Safe to re-run (every insert ignores rows that already exist).
--
-- What is NOT here, on purpose:
--   * user accounts, profiles, events, registrations. A real account
--     needs Supabase Auth to hash the password and create its identity
--     record. Writing to auth.users by hand is fragile, so demo users
--     (and the events they own) will be created in Stage 4 by a local
--     script that calls the Supabase Admin API. That script runs on your
--     machine with the service-role key; it never ships to the browser.
-- =====================================================================

insert into public.departments (code, name) values
  ('CSE', 'Computer Science & Engineering'),
  ('ECE', 'Electronics & Communication Engineering'),
  ('EEE', 'Electrical & Electronics Engineering'),
  ('ME',  'Mechanical Engineering'),
  ('DS',  'Data Science'),
  ('DES', 'Design'),
  ('BBA', 'Business Administration')
on conflict (code) do nothing;

-- Venues named in the existing UI.
insert into public.venues (name, building, capacity, description) values
  ('Innovation & Incubation Lab',      'Block A',      120, 'Open-plan lab with power at every desk; suited to hackathons.'),
  ('Open Air Amphitheatre',            'Central Lawn', 400, 'Outdoor stage for cultural evenings.'),
  ('Design & Prototyping Studio',      'Block D',       60, 'Makerspace with 3D printers and workbenches.'),
  ('Tech Seminar Hall 1',              'Block B',      150, 'Tiered seminar hall with projector and recording.'),
  ('Dr. APJ Abdul Kalam Auditorium',   'Main Building',800, 'Main auditorium for university-scale events.')
on conflict (name) do nothing;

-- Academic terms for the 2026-27 year.
insert into public.academic_terms (name, starts_on, ends_on) values
  ('2026-27 Odd Semester',  date '2026-08-01', date '2026-12-15'),
  ('2026-27 Even Semester', date '2027-01-05', date '2027-05-31')
on conflict (name) do nothing;

-- Clubs shown in the existing Clubs directory.
insert into public.clubs (name, short_name, description, category_id, department_id)
select v.name, v.short_name, v.description, c.id, d.id
from (values
  ('IEEE Student Branch',          'IE', 'A student-led home for builders, researchers, and anyone curious about what comes next.', 'technology',       'ECE'),
  ('Campus Cultural Guild',        'CG', 'Music, theatre, visual arts, and the little moments that make campus memorable.',         'arts-culture',     null),
  ('AI & Robotics Society (AIRS)', 'AI', 'Learn by making: autonomous systems, machine intelligence, and weekend build sessions.',   'technology',       'CSE'),
  ('E-Cell Entrepreneurship Hub',  'EC', 'A practical community for founders, operators, mentors, and ambitious first experiments.', 'entrepreneurship', 'BBA'),
  ('Women in Tech Campus',         'WT', 'A welcoming peer network for women and allies building confidence in tech.',               'community',        null),
  ('Design Guild',                 'DG', 'A studio-like community for thoughtful interfaces, research, and creative problem solving.', 'arts-culture',   'DES')
) as v(name, short_name, description, category_slug, dept_code)
left join public.categories  c on c.slug = v.category_slug
left join public.departments d on d.code = v.dept_code
on conflict (name) do nothing;
