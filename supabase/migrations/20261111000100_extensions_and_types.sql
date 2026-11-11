-- =====================================================================
-- CampusSync migration 1/4 — extensions and custom types
-- ---------------------------------------------------------------------
-- A *migration* is a numbered SQL file that changes the database
-- structure. Files run in filename order, exactly once, so every copy
-- of the database (yours, a teammate's, production) ends up identical.
-- Never edit a migration after it has been applied: add a new one.
-- =====================================================================

-- btree_gist lets one GiST index combine "equals" checks (venue_id = …)
-- with "overlaps" checks (time range && …). We need it for the
-- no-double-booking rule on venues and the no-overlapping-classes rule
-- on timetables. Supabase keeps extensions in the `extensions` schema.
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- Enums: columns that may only hold values from a fixed list.
-- The database rejects anything else, e.g. role = 'superadmin'.
-- ---------------------------------------------------------------------
create type public.app_role as enum ('student', 'organizer', 'dsa', 'admin');

-- One lifecycle column for events (decision D1). See docs/SCHEMA_PROPOSAL.md §6.
create type public.event_status as enum (
  'draft', 'submitted', 'under_review', 'changes_requested',
  'approved', 'rejected', 'published', 'completed', 'cancelled'
);

create type public.event_type as enum (
  'workshop', 'hackathon', 'seminar', 'competition', 'cultural',
  'sports', 'guest_lecture', 'club_activity', 'other'
);

-- How "big" an event is; drives campus-wide scheduling warnings.
create type public.event_scope as enum ('club', 'department', 'university');

create type public.registration_status as enum ('registered', 'cancelled');

create type public.conflict_status as enum (
  'no_conflict', 'partial_conflict', 'full_conflict', 'timetable_not_configured'
);

create type public.od_status as enum ('pending', 'approved', 'rejected', 'withdrawn');

create type public.check_in_method as enum ('qr', 'manual');

create type public.membership_role as enum ('lead', 'coordinator', 'member');

create type public.membership_status as enum ('active', 'pending', 'inactive');

-- A range type over clock times (e.g. [09:00, 10:30)), used to stop a
-- student from entering two classes that overlap on the same day.
-- PostgreSQL has date and timestamp ranges built in, but not time ranges.
create type public.time_range as range (subtype = time);
