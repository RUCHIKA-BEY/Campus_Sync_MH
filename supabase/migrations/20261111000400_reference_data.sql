-- =====================================================================
-- CampusSync migration 4/4 — reference data the application needs
-- ---------------------------------------------------------------------
-- Unlike seed.sql (fictional demo content for development), these rows
-- are required in EVERY environment, including production: the UI's
-- category tabs and the platform rules depend on them.
-- `on conflict do nothing` makes the file safe to re-run.
-- =====================================================================

-- Event categories (matches the tabs/filters already in index.html).
insert into public.categories (name, slug, sort_order) values
  ('Technology',       'technology',       10),
  ('Hackathons',       'hackathons',       20),
  ('Entrepreneurship', 'entrepreneurship', 30),
  ('Arts & Culture',   'arts-culture',     40),
  ('Music',            'music',            50),
  ('Research',         'research',         60),
  ('Sports',           'sports',           70),
  ('Community',        'community',        80)
on conflict (slug) do nothing;

-- Platform rules (decisions D5, D7, D8, D9 and the campus timezone).
insert into public.platform_settings (key, value, description) values
  ('campus_timezone',
   '"Asia/Kolkata"',
   'Timezone used to turn weekly class times into real timestamps.'),
  ('od_reviewer_roles',
   '["dsa"]',
   'Roles allowed to approve or reject OD requests (D5).'),
  ('campus_warning_min_scope',
   '"department"',
   'Events at or above this scope are compared for campus-wide audience clashes.'),
  ('allow_registration_on_full_conflict',
   'true',
   'D8: a student may still register when every minute clashes with class (with a warning).'),
  ('registration_cancellable_until',
   '"registration_closes_at"',
   'D9: students may cancel until the registration deadline.'),
  ('waitlist_enabled',
   'false',
   'D7: waitlists are a future enhancement; full events return "event full".')
on conflict (key) do nothing;
