-- =====================================================================
-- CampusSync migration 7 — explicit Data API grants
-- ---------------------------------------------------------------------
-- WHY THIS EXISTS
-- Until 2026, Supabase automatically granted SELECT/INSERT/UPDATE/DELETE
-- on every new `public` table to the API roles. Since 30 Oct 2026 it no
-- longer does ("Automatically expose new tables" is off for all projects).
-- Without a GRANT, every request fails with
--   42501 permission denied for table …
-- BEFORE any RLS policy is even consulted.
--
-- Two separate gates, both must say yes:
--   1. GRANT  (this file): may this ROLE use this table/column at all?
--   2. RLS    (migration 6): which ROWS may this particular user touch?
--
-- APPROACH: least privilege, and the same result on every project.
-- We first revoke everything the browser roles might hold (older projects
-- had broad automatic grants), then grant exactly what the RLS policies
-- in migration 6 can use. Note: REVOKE ALL on a table also removes its
-- column-level grants, so the column grants from migrations 5 and 6 are
-- re-stated here. From now on THIS file is the single source of truth
-- for API grants; every future migration that adds a table must also
-- add its grants (see docs/MIGRATIONS.md).
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

revoke all on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
-- anon (logged-out visitors): public read-only catalogue
-- ---------------------------------------------------------------------
grant select on public.departments, public.categories, public.venues,
                public.clubs, public.events, public.event_audiences
  to anon;

-- ---------------------------------------------------------------------
-- authenticated (any logged-in user). RLS narrows every one of these.
-- ---------------------------------------------------------------------
-- Reference data: everyone reads; RLS allows writes for admins only.
grant select, insert, update, delete
  on public.departments, public.categories, public.academic_terms, public.venues
  to authenticated;
grant select, update on public.platform_settings to authenticated;

-- profiles: read (RLS: own / DSA / admin); update personal columns only.
grant select on public.profiles to authenticated;
grant update (full_name, registration_number, department_id, academic_year,
              semester, phone_number, avatar_url)
  on public.profiles to authenticated;

-- Personal lists (RLS: own rows only).
grant select, insert, delete on public.student_interests, public.saved_events,
                                public.club_follows
  to authenticated;
grant select, insert, update, delete on public.timetable_slots to authenticated;

-- Clubs (RLS: admins write).
grant select, insert, update, delete on public.clubs, public.club_members to authenticated;

-- events: no status / review / publication columns are writable.
grant select, delete on public.events to authenticated;
grant insert (club_id, created_by, title, description, category_id, event_type, scope,
              venue_id, starts_at, ends_at, registration_opens_at, registration_closes_at,
              capacity, od_eligible, poster_url)
  on public.events to authenticated;
grant update (club_id, title, description, category_id, event_type, scope,
              venue_id, starts_at, ends_at, registration_opens_at, registration_closes_at,
              capacity, od_eligible, poster_url)
  on public.events to authenticated;
grant select, insert, delete on public.event_audiences to authenticated;

-- Workflow tables: read only. Writes happen inside checked functions
-- (Stages 5–7), which run with the owner's rights.
grant select on public.event_registrations, public.od_requests,
                public.attendance_sessions, public.attendance_records,
                public.audit_logs
  to authenticated;
grant select, insert on public.event_feedback to authenticated;

-- notifications: read own; may only flip is_read.
grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;

-- ---------------------------------------------------------------------
-- service_role (server-side scripts with the SECRET key, never browsers).
-- It bypasses RLS but still needs table privileges. audit_logs stays
-- protected by its append-only trigger regardless.
-- ---------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
