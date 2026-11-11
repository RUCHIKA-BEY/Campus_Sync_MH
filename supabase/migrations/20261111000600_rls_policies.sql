-- =====================================================================
-- CampusSync migration 6 — Row Level Security policies
-- ---------------------------------------------------------------------
-- Migration 3 switched RLS on with NO policies (nobody sees anything).
-- Each policy below opens exactly one door for one kind of user.
--
-- How to read a policy:
--   FOR SELECT/INSERT/UPDATE/DELETE  which operation it allows
--   TO anon / authenticated          logged-out vs logged-in requests
--   USING (…)        which EXISTING rows are visible / may be changed
--   WITH CHECK (…)   what the row must look like AFTER insert/update
-- Policies of the same operation are OR-ed together.
--
-- (select auth.uid()) is wrapped in a sub-select so PostgreSQL evaluates
-- it once per query instead of once per row (a Supabase-recommended
-- performance pattern).
--
-- Operations with NO policy here are deliberately impossible from the
-- browser; they happen only inside checked workflow functions (RPCs)
-- added in Stages 5–7: registering, submitting/approving events,
-- creating/deciding OD requests, check-in.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Reference data: public read, admin write
-- ---------------------------------------------------------------------
create policy "departments: anyone can read" on public.departments
  for select to anon, authenticated using (true);
create policy "departments: admin insert" on public.departments
  for insert to authenticated with check (public.has_role('admin'));
create policy "departments: admin update" on public.departments
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "departments: admin delete" on public.departments
  for delete to authenticated using (public.has_role('admin'));

create policy "categories: anyone can read" on public.categories
  for select to anon, authenticated using (true);
create policy "categories: admin insert" on public.categories
  for insert to authenticated with check (public.has_role('admin'));
create policy "categories: admin update" on public.categories
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "categories: admin delete" on public.categories
  for delete to authenticated using (public.has_role('admin'));

create policy "terms: logged-in users can read" on public.academic_terms
  for select to authenticated using (true);
create policy "terms: admin insert" on public.academic_terms
  for insert to authenticated with check (public.has_role('admin'));
create policy "terms: admin update" on public.academic_terms
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "terms: admin delete" on public.academic_terms
  for delete to authenticated using (public.has_role('admin'));

create policy "venues: anyone can read" on public.venues
  for select to anon, authenticated using (true);
create policy "venues: admin insert" on public.venues
  for insert to authenticated with check (public.has_role('admin'));
create policy "venues: admin update" on public.venues
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "venues: admin delete" on public.venues
  for delete to authenticated using (public.has_role('admin'));

create policy "settings: logged-in users can read" on public.platform_settings
  for select to authenticated using (true);
create policy "settings: admin update" on public.platform_settings
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- ---------------------------------------------------------------------
-- profiles (column privileges in migration 5 limit WHICH columns)
-- ---------------------------------------------------------------------
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: dsa and admin read all" on public.profiles
  for select to authenticated using (public.has_role('dsa', 'admin'));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy "profiles: admin update" on public.profiles
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
-- No INSERT policy: only the signup trigger creates profiles.
-- No DELETE policy: deleting the auth user cascades; admins deactivate.

-- ---------------------------------------------------------------------
-- student_interests: private to the student
-- ---------------------------------------------------------------------
create policy "interests: read own" on public.student_interests
  for select to authenticated using (student_id = (select auth.uid()));
create policy "interests: add own" on public.student_interests
  for insert to authenticated with check (student_id = (select auth.uid()));
create policy "interests: remove own" on public.student_interests
  for delete to authenticated using (student_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- clubs, memberships, follows
-- ---------------------------------------------------------------------
create policy "clubs: anyone reads active clubs" on public.clubs
  for select to anon, authenticated using (status = 'active');
create policy "clubs: admin reads all" on public.clubs
  for select to authenticated using (public.has_role('admin'));
create policy "clubs: admin insert" on public.clubs
  for insert to authenticated with check (public.has_role('admin'));
create policy "clubs: admin update" on public.clubs
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "clubs: admin delete" on public.clubs
  for delete to authenticated using (public.has_role('admin'));

create policy "club_members: read own memberships" on public.club_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy "club_members: managers read their club" on public.club_members
  for select to authenticated using (public.is_club_manager(club_id));
create policy "club_members: dsa and admin read all" on public.club_members
  for select to authenticated using (public.has_role('dsa', 'admin'));
create policy "club_members: admin insert" on public.club_members
  for insert to authenticated with check (public.has_role('admin'));
create policy "club_members: admin update" on public.club_members
  for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "club_members: admin delete" on public.club_members
  for delete to authenticated using (public.has_role('admin'));

create policy "club_follows: read own" on public.club_follows
  for select to authenticated using (student_id = (select auth.uid()));
create policy "club_follows: follow" on public.club_follows
  for insert to authenticated with check (student_id = (select auth.uid()));
create policy "club_follows: unfollow" on public.club_follows
  for delete to authenticated using (student_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------
-- Column privileges: organizers may write only the descriptive and
-- scheduling columns. status, reviewed_by, review_note, published_at,
-- cancelled_at… can be changed ONLY by the workflow functions (Stage 5),
-- so an organizer can never mark their own event approved or published.
revoke insert, update on public.events from anon, authenticated;
grant insert (club_id, created_by, title, description, category_id, event_type, scope,
              venue_id, starts_at, ends_at, registration_opens_at, registration_closes_at,
              capacity, od_eligible, poster_url)
  on public.events to authenticated;
grant update (club_id, title, description, category_id, event_type, scope,
              venue_id, starts_at, ends_at, registration_opens_at, registration_closes_at,
              capacity, od_eligible, poster_url)
  on public.events to authenticated;

-- Public discovery: only published/completed events, plus published
-- events that were later cancelled (so registrants see the cancellation).
create policy "events: anyone reads public events" on public.events
  for select to anon, authenticated
  using (status in ('published', 'completed')
         or (status = 'cancelled' and published_at is not null));
create policy "events: managers read their club's events" on public.events
  for select to authenticated using (public.is_club_manager(club_id));
create policy "events: dsa reads all non-draft events" on public.events
  for select to authenticated using (public.has_role('dsa') and status <> 'draft');
create policy "events: admin reads all" on public.events
  for select to authenticated using (public.has_role('admin'));

-- Create: only as yourself, only for a club you manage. status is not in
-- the column grant, so it always starts as the default 'draft'.
create policy "events: managers create drafts" on public.events
  for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_club_manager(club_id));

-- Edit: only while the event is a draft or sent back for changes, and it
-- must still belong to a club you manage afterwards.
create policy "events: managers edit drafts" on public.events
  for update to authenticated
  using (public.is_club_manager(club_id) and status in ('draft', 'changes_requested'))
  with check (public.is_club_manager(club_id) and status in ('draft', 'changes_requested'));

-- Delete: drafts only (anything submitted has history worth keeping).
create policy "events: managers or admin delete drafts" on public.events
  for delete to authenticated
  using (status = 'draft' and (public.is_club_manager(club_id) or public.has_role('admin')));

-- ---------------------------------------------------------------------
-- event_audiences: visible when the event is visible; editable with it
-- ---------------------------------------------------------------------
-- The EXISTS sub-query is itself filtered by the events policies above,
-- so "visible event" means exactly what the caller may see.
create policy "audiences: read if event visible" on public.event_audiences
  for select to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id));
create policy "audiences: managers add to editable events" on public.event_audiences
  for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id
                      and e.status in ('draft', 'changes_requested')
                      and public.is_club_manager(e.club_id)));
create policy "audiences: managers remove from editable events" on public.event_audiences
  for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id
                 and e.status in ('draft', 'changes_requested')
                 and public.is_club_manager(e.club_id)));

-- ---------------------------------------------------------------------
-- Participation
-- ---------------------------------------------------------------------
create policy "registrations: read own" on public.event_registrations
  for select to authenticated using (student_id = (select auth.uid()));
create policy "registrations: managers read their events" on public.event_registrations
  for select to authenticated using (public.manages_event(event_id));
create policy "registrations: dsa and admin read all" on public.event_registrations
  for select to authenticated using (public.has_role('dsa', 'admin'));
-- Insert/cancel: Stage 6 register_for_event / cancel_registration RPCs.

create policy "saved: read own" on public.saved_events
  for select to authenticated using (student_id = (select auth.uid()));
create policy "saved: save" on public.saved_events
  for insert to authenticated with check (student_id = (select auth.uid()));
create policy "saved: unsave" on public.saved_events
  for delete to authenticated using (student_id = (select auth.uid()));

-- Timetables are private: nobody else reads them, not even DSA.
create policy "timetable: read own" on public.timetable_slots
  for select to authenticated using (student_id = (select auth.uid()));
create policy "timetable: add own" on public.timetable_slots
  for insert to authenticated with check (student_id = (select auth.uid()));
create policy "timetable: edit own" on public.timetable_slots
  for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));
create policy "timetable: delete own" on public.timetable_slots
  for delete to authenticated using (student_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- OD and attendance (all writes via Stage 6/7 RPCs)
-- ---------------------------------------------------------------------
create policy "od: read own" on public.od_requests
  for select to authenticated using (student_id = (select auth.uid()));
create policy "od: reviewers read all" on public.od_requests
  for select to authenticated using (public.can_review_od());
create policy "od: managers read their events" on public.od_requests
  for select to authenticated using (public.manages_event(event_id));
create policy "od: admin reads all" on public.od_requests
  for select to authenticated using (public.has_role('admin'));

create policy "sessions: managers read their events" on public.attendance_sessions
  for select to authenticated using (public.manages_event(event_id));
create policy "sessions: dsa and admin read all" on public.attendance_sessions
  for select to authenticated using (public.has_role('dsa', 'admin'));

create policy "attendance: read own" on public.attendance_records
  for select to authenticated using (student_id = (select auth.uid()));
create policy "attendance: managers read their events" on public.attendance_records
  for select to authenticated using (public.manages_event(event_id));
create policy "attendance: dsa and admin read all" on public.attendance_records
  for select to authenticated using (public.has_role('dsa', 'admin'));

create policy "feedback: read own" on public.event_feedback
  for select to authenticated using (student_id = (select auth.uid()));
create policy "feedback: managers read their events" on public.event_feedback
  for select to authenticated using (public.manages_event(event_id));
create policy "feedback: dsa and admin read all" on public.event_feedback
  for select to authenticated using (public.has_role('dsa', 'admin'));
-- The foreign key to attendance_records already guarantees attendance.
create policy "feedback: give own" on public.event_feedback
  for insert to authenticated with check (student_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- notifications: your inbox only; you may only flip is_read
-- ---------------------------------------------------------------------
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (is_read) on public.notifications to authenticated;
create policy "notifications: read own" on public.notifications
  for select to authenticated using (recipient_id = (select auth.uid()));
create policy "notifications: mark own read" on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- audit_logs: admins read; nobody writes directly
-- ---------------------------------------------------------------------
revoke insert on public.audit_logs from anon, authenticated;
create policy "audit: admin reads" on public.audit_logs
  for select to authenticated using (public.has_role('admin'));
