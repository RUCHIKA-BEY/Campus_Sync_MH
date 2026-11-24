-- =====================================================================
-- CampusSync migration 10 — Stage 7: On-Duty requests & attendance
-- ---------------------------------------------------------------------
-- Explained in docs/BUSINESS_LOGIC.md §7–§8.
--
-- Three separate records, never merged:
--   registration  → "I signed up"            (event_registrations)
--   OD request    → "excuse me from class"   (od_requests)
--   attendance    → "I was actually there"   (attendance_records)
-- Approving OD never creates attendance.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. On-Duty requests
-- ---------------------------------------------------------------------
-- A student may request OD only when ALL of these hold:
--   * they hold an active registration for the event
--   * the event is OD-eligible and published, and hasn't ended
--   * the database finds a real class clash right now (partial or full);
--     the clashing classes are stored as evidence (conflict_snapshot)
create or replace function public.request_od(p_event_id uuid, p_reason text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events := public._lock_event(p_event_id);
  reg public.event_registrations;
  conflict jsonb;
  reason text := trim(coalesce(p_reason, ''));
  new_id uuid;
begin
  select * into reg from public.event_registrations r
  where r.event_id = e.id and r.student_id = auth.uid() and r.status = 'registered';
  if not found then
    raise exception 'Register for the event before requesting On-Duty.' using errcode = 'P0001';
  end if;
  if not e.od_eligible then
    raise exception 'This event is not OD-eligible.' using errcode = 'P0001';
  end if;
  if e.status <> 'published' or now() >= e.ends_at then
    raise exception 'On-Duty can only be requested for upcoming or ongoing published events.' using errcode = 'P0001';
  end if;
  if length(reason) < 10 then
    raise exception 'Please explain your request in at least 10 characters.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.od_requests o where o.registration_id = reg.id and o.status in ('pending', 'approved')) then
    raise exception 'You already have an active On-Duty request for this event.' using errcode = '23505';
  end if;

  conflict := public._timetable_conflict(e, auth.uid());
  if conflict->>'status' = 'timetable_not_configured' then
    raise exception 'Add your timetable first so the class clash can be verified.' using errcode = 'P0001';
  end if;
  if conflict->>'status' = 'no_conflict' then
    raise exception 'This event doesn’t clash with any of your classes, so On-Duty isn’t needed.' using errcode = 'P0001';
  end if;

  insert into public.od_requests (registration_id, student_id, event_id, reason, conflict_snapshot)
  values (reg.id, auth.uid(), e.id, reason, conflict->'conflicts')
  returning id into new_id;

  -- Notify everyone allowed to review OD (platform_settings.od_reviewer_roles).
  perform public.notify(p.id, 'od_requested', 'New On-Duty request',
                        format('An OD request for "%s" needs review.', e.title), 'od_request', new_id, format('od:%s:requested', new_id))
  from public.profiles p
  where p.is_active and p.role::text in (
    select jsonb_array_elements_text(s.value) from public.platform_settings s where s.key = 'od_reviewer_roles');
  return new_id;
end;
$$;

create or replace function public.withdraw_od(p_request_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.od_requests set status = 'withdrawn'
  where id = p_request_id and student_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Only your own pending requests can be withdrawn.' using errcode = 'P0001';
  end if;
end;
$$;

-- p_decision: 'approve' | 'reject'
create or replace function public.decide_od(p_request_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  o public.od_requests;
  note text := nullif(trim(coalesce(p_note, '')), '');
  title text;
  new_status public.od_status;
begin
  if not public.can_review_od() then
    raise exception 'You are not an authorised On-Duty reviewer.' using errcode = '42501';
  end if;
  select * into o from public.od_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if o.student_id = auth.uid() then
    raise exception 'You cannot decide your own request.' using errcode = '42501';
  end if;
  if o.status <> 'pending' then
    raise exception 'This request has already been %.', o.status using errcode = 'P0001';
  end if;
  new_status := case p_decision when 'approve' then 'approved'::public.od_status when 'reject' then 'rejected'::public.od_status end;
  if new_status is null then
    raise exception 'Unknown decision "%".', p_decision using errcode = '22023';
  end if;
  if new_status = 'rejected' and length(coalesce(note, '')) < 10 then
    raise exception 'Please give a reason of at least 10 characters.' using errcode = 'P0001';
  end if;

  update public.od_requests
     set status = new_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = note
   where id = o.id;
  -- Note: no attendance is created here. OD approval ≠ attendance.

  select e.title into title from public.events e where e.id = o.event_id;
  perform public.write_audit('od.' || p_decision, 'od_request', o.id, jsonb_build_object('note', note, 'event_id', o.event_id));
  perform public.notify(o.student_id, 'od_' || new_status::text,
    case new_status when 'approved' then 'On-Duty approved' else 'On-Duty not approved' end,
    case when note is null then format('Your OD request for "%s" was %s.', title, new_status)
         else format('"%s": %s', title, note) end,
    'od_request', o.id, format('od:%s:%s', o.id, new_status));
end;
$$;

-- Review queue with the details a reviewer needs (profiles stay private
-- otherwise). p_status NULL = all.
create or replace function public.get_od_queue(p_status public.od_status default 'pending')
returns table (request_id uuid, status public.od_status, reason text, requested_at timestamptz, reviewed_at timestamptz,
               review_note text, conflict_snapshot jsonb, student_name text, registration_number text,
               department_code text, event_id uuid, event_title text, starts_at timestamptz, ends_at timestamptz, club_name text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not (public.can_review_od() or public.has_role('admin')) then
    raise exception 'You are not an authorised On-Duty reviewer.' using errcode = '42501';
  end if;
  return query
  select o.id, o.status, o.reason, o.requested_at, o.reviewed_at, o.review_note, o.conflict_snapshot,
         p.full_name, p.registration_number, d.code, e.id, e.title, e.starts_at, e.ends_at, c.name
  from public.od_requests o
  join public.profiles p on p.id = o.student_id
  left join public.departments d on d.id = p.department_id
  join public.events e on e.id = o.event_id
  join public.clubs c on c.id = e.club_id
  where p_status is null or o.status = p_status
  order by o.requested_at
  limit 200;
end;
$$;

-- A student's own OD requests (with event names).
create or replace function public.my_od_requests()
returns table (request_id uuid, event_id uuid, event_title text, status public.od_status, reason text,
               review_note text, requested_at timestamptz, reviewed_at timestamptz, conflict_snapshot jsonb)
language sql stable security definer
set search_path = ''
as $$
  select o.id, e.id, e.title, o.status, o.reason, o.review_note, o.requested_at, o.reviewed_at, o.conflict_snapshot
  from public.od_requests o join public.events e on e.id = o.event_id
  where o.student_id = auth.uid()
  order by o.requested_at desc
$$;

-- ---------------------------------------------------------------------
-- 2. Attendance sessions (the time limit for QR check-in)
-- ---------------------------------------------------------------------
-- Check-in is possible only while an organizer has an attendance session
-- OPEN for the event. Sessions can be opened from 2 hours before the start
-- until the event ends, and last at most 12 hours.
create or replace function public.open_attendance_session(p_event_id uuid, p_minutes int default 180)
returns public.attendance_sessions
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events := public._lock_event(p_event_id);
  s public.attendance_sessions;
begin
  if not public.is_club_manager(e.club_id) then
    raise exception 'Only this club’s organizers can run check-in.' using errcode = '42501';
  end if;
  if e.status <> 'published' then
    raise exception 'Check-in is only for published events.' using errcode = 'P0001';
  end if;
  if now() < e.starts_at - interval '2 hours' or now() >= e.ends_at then
    raise exception 'Check-in opens 2 hours before the event and closes when it ends.' using errcode = 'P0001';
  end if;
  if p_minutes is null or p_minutes < 5 or p_minutes > 720 then
    raise exception 'A session must last between 5 and 720 minutes.' using errcode = '22023';
  end if;
  -- Close any session still open, so there is only ever one.
  update public.attendance_sessions set closed_early_at = now()
  where event_id = e.id and closed_early_at is null and closes_at > now();

  insert into public.attendance_sessions (event_id, opened_by, opens_at, closes_at)
  values (e.id, auth.uid(), now(), now() + make_interval(mins => p_minutes))
  returning * into s;
  perform public.write_audit('attendance.open_session', 'event', e.id, jsonb_build_object('session_id', s.id, 'minutes', p_minutes));
  return s;
end;
$$;

create or replace function public.close_attendance_session(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  s public.attendance_sessions;
  club uuid;
begin
  select * into s from public.attendance_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
  select club_id into club from public.events where id = s.event_id;
  if not public.is_club_manager(club) then
    raise exception 'Only this club’s organizers can run check-in.' using errcode = '42501';
  end if;
  update public.attendance_sessions set closed_early_at = now() where id = s.id and closed_early_at is null;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. QR check-in (organizer scans the student's pass)
-- ---------------------------------------------------------------------
-- The QR code holds only the registration's random pass code (122 bits),
-- with no personal data and no signing secret. Validation happens HERE:
--   * the caller manages the event's club
--   * a session for THIS event is open right now (time limit)
--   * the pass belongs to THIS event and is an active registration
--   * the student hasn't already checked in (unique constraint too)
-- It returns the student's name so the organizer can compare it with the
-- person in front of them (limits screenshot sharing).
create or replace function public.check_in(p_event_id uuid, p_pass_code text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events;
  s public.attendance_sessions;
  reg public.event_registrations;
  code text := lower(regexp_replace(coalesce(p_pass_code, ''), '^CAMPUSSYNC\|', '', 'i'));
  existing timestamptz;
  who record;
begin
  select * into e from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if not public.is_club_manager(e.club_id) then
    raise exception 'Only this club’s organizers can check people in.' using errcode = '42501';
  end if;
  select * into s from public.attendance_sessions
  where event_id = e.id and closed_early_at is null and now() >= opens_at and now() < closes_at
  order by opens_at desc limit 1;
  if not found then
    raise exception 'Check-in is closed. Open an attendance session first.' using errcode = 'P0001';
  end if;
  if code !~ '^[0-9a-f]{32}$' then
    raise exception 'That is not a CampusSync pass.' using errcode = '22023';
  end if;

  select * into reg from public.event_registrations where pass_code = code;
  if not found then
    raise exception 'Unknown pass.' using errcode = 'P0002';
  end if;
  if reg.event_id <> e.id then
    raise exception 'This pass is for a different event.' using errcode = 'P0001';
  end if;
  if reg.status <> 'registered' then
    raise exception 'This registration was cancelled.' using errcode = 'P0001';
  end if;
  select checked_in_at into existing from public.attendance_records where event_id = e.id and student_id = reg.student_id;
  if found then
    raise exception 'Already checked in at %.', to_char(existing at time zone public._campus_tz(), 'HH24:MI') using errcode = '23505';
  end if;

  insert into public.attendance_records (registration_id, event_id, student_id, session_id, method, recorded_by)
  values (reg.id, e.id, reg.student_id, s.id, 'qr', auth.uid());

  select p.full_name, p.registration_number into who from public.profiles p where p.id = reg.student_id;
  perform public.notify(reg.student_id, 'attendance_confirmed', 'Checked in',
    format('Your attendance at "%s" was recorded.', e.title), 'event', e.id, format('attendance:%s', reg.id));
  return jsonb_build_object('student_name', who.full_name, 'registration_number', who.registration_number, 'checked_in_at', now());
end;
$$;

-- Manual fallback (phone dead, camera broken…). Recorded as 'manual', never
-- presented as QR, and audited because it bypasses the pass check.
create or replace function public.mark_attendance_manual(p_registration_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  reg public.event_registrations;
  e public.events;
begin
  select * into reg from public.event_registrations where id = p_registration_id;
  if not found then
    raise exception 'Registration not found' using errcode = 'P0002';
  end if;
  select * into e from public.events where id = reg.event_id;
  if not public.is_club_manager(e.club_id) then
    raise exception 'Only this club’s organizers can mark attendance.' using errcode = '42501';
  end if;
  if e.status not in ('published', 'completed') or now() < e.starts_at - interval '2 hours' then
    raise exception 'Attendance can be marked from 2 hours before the event.' using errcode = 'P0001';
  end if;
  if reg.status <> 'registered' then
    raise exception 'This registration was cancelled.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.attendance_records a where a.event_id = e.id and a.student_id = reg.student_id) then
    raise exception 'Already marked present.' using errcode = '23505';
  end if;
  insert into public.attendance_records (registration_id, event_id, student_id, method, recorded_by)
  values (reg.id, e.id, reg.student_id, 'manual', auth.uid());
  perform public.write_audit('attendance.manual_mark', 'event', e.id, jsonb_build_object('registration_id', reg.id));
  perform public.notify(reg.student_id, 'attendance_confirmed', 'Checked in',
    format('Your attendance at "%s" was recorded.', e.title), 'event', e.id, format('attendance:%s', reg.id));
end;
$$;

create or replace function public.revoke_attendance(p_registration_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  a public.attendance_records;
  club uuid;
begin
  select * into a from public.attendance_records where registration_id = p_registration_id for update;
  if not found then
    raise exception 'No attendance recorded for this registration.' using errcode = 'P0002';
  end if;
  select club_id into club from public.events where id = a.event_id;
  if not (public.is_club_manager(club) or public.has_role('dsa', 'admin')) then
    raise exception 'You cannot change this attendance record.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Please give a reason of at least 10 characters.' using errcode = 'P0001';
  end if;
  update public.attendance_records set verification_status = 'revoked' where id = a.id;
  perform public.write_audit('attendance.revoke', 'event', a.event_id, jsonb_build_object('registration_id', p_registration_id, 'reason', trim(p_reason)));
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Attendance views
-- ---------------------------------------------------------------------
-- Organizer view: every registrant plus their check-in state, and the
-- currently open session (if any).
create or replace function public.get_event_attendance(p_event_id uuid)
returns table (registration_id uuid, full_name text, registration_number text, department_code text,
               registration_status public.registration_status, checked_in_at timestamptz,
               method public.check_in_method, verification_status text,
               open_session_id uuid, session_closes_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  e public.events;
  s public.attendance_sessions;
begin
  select * into e from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if not (public.is_club_manager(e.club_id) or public.has_role('dsa', 'admin')) then
    raise exception 'Only the club’s organizers, DSA or admins can see attendance.' using errcode = '42501';
  end if;
  select * into s from public.attendance_sessions
  where event_id = e.id and closed_early_at is null and now() >= opens_at and now() < closes_at
  order by opens_at desc limit 1;
  return query
  select r.id, p.full_name, p.registration_number, d.code, r.status, a.checked_in_at, a.method, a.verification_status,
         s.id, s.closes_at
  from public.event_registrations r
  join public.profiles p on p.id = r.student_id
  left join public.departments d on d.id = p.department_id
  left join public.attendance_records a on a.registration_id = r.id
  where r.event_id = e.id
  order by (a.checked_in_at is null), p.full_name;
end;
$$;

-- A student's own attendance history.
create or replace function public.my_attendance()
returns table (event_id uuid, event_title text, starts_at timestamptz, checked_in_at timestamptz,
               method public.check_in_method, verification_status text)
language sql stable security definer
set search_path = ''
as $$
  select e.id, e.title, e.starts_at, a.checked_in_at, a.method, a.verification_status
  from public.attendance_records a join public.events e on e.id = a.event_id
  where a.student_id = auth.uid()
  order by a.checked_in_at desc
$$;

-- ---------------------------------------------------------------------
-- 5. Privileges
-- ---------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.request_od(uuid, text)', 'public.withdraw_od(uuid)', 'public.decide_od(uuid, text, text)',
    'public.get_od_queue(public.od_status)', 'public.my_od_requests()',
    'public.open_attendance_session(uuid, integer)', 'public.close_attendance_session(uuid)',
    'public.check_in(uuid, text)', 'public.mark_attendance_manual(uuid)', 'public.revoke_attendance(uuid, text)',
    'public.get_event_attendance(uuid)', 'public.my_attendance()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
