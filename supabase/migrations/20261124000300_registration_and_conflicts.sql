-- =====================================================================
-- CampusSync migration 9 — Stage 6: timetable conflicts, registration,
-- seat counts, campus-wide scheduling warnings, registrant lists
-- ---------------------------------------------------------------------
-- Explained in docs/BUSINESS_LOGIC.md §3–§5.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Timetable conflict detection (the ONE authoritative implementation)
-- ---------------------------------------------------------------------
-- Two intervals overlap when   event_start < class_end AND event_end > class_start
-- (half-open [start, end): an event ending at 10:00 does NOT clash with a
-- class starting at 10:00).
--
-- Weekly classes are stored as (day_of_week, start_time, end_time) in
-- campus time. To compare them with an event, we walk through every
-- CAMPUS calendar day the event touches (so an event crossing midnight is
-- split correctly), build that day's real class timestamps in the campus
-- timezone, and intersect.
--
-- Result status:
--   full_conflict             every minute of the event is covered by classes
--   partial_conflict          some minutes are
--   no_conflict               none are, AND the timetable covers every event day
--   timetable_not_configured  no clash found, but the student has no timetable
--                             for (some of) the event's days. We never assume
--                             "free" just because nothing was entered.
create or replace function public._timetable_conflict(p_event public.events, p_student uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  tz text := public._campus_tz();
  d date;
  last_day date;
  win_s timestamptz;
  win_e timestamptz;
  v_term uuid;
  complete boolean := true;
  total int := 0;
  conflicts jsonb := '[]'::jsonb;
  r record;
  ev_minutes int := round(extract(epoch from (p_event.ends_at - p_event.starts_at)) / 60)::int;
  status public.conflict_status;
begin
  d := (p_event.starts_at at time zone tz)::date;
  last_day := ((p_event.ends_at - interval '1 microsecond') at time zone tz)::date;

  while d <= last_day loop
    -- The part of the event that falls on campus day d.
    win_s := greatest(p_event.starts_at, d::timestamp at time zone tz);
    win_e := least(p_event.ends_at, (d + 1)::timestamp at time zone tz);

    select t.id into v_term from public.academic_terms t where d between t.starts_on and t.ends_on;
    if v_term is null
       or not exists (select 1 from public.timetable_slots s where s.student_id = p_student and s.term_id = v_term) then
      complete := false;     -- no term, or no timetable entered for that term
    end if;

    if v_term is not null then
      for r in
        select s.subject_name, s.course_code, s.room,
               (d + s.start_time) at time zone tz as c_s,
               (d + s.end_time)   at time zone tz as c_e
        from public.timetable_slots s
        where s.student_id = p_student and s.term_id = v_term
          and s.day_of_week = extract(isodow from d)
          and win_s < (d + s.end_time) at time zone tz      -- the overlap rule
          and win_e > (d + s.start_time) at time zone tz
        order by s.start_time
      loop
        total := total + round(extract(epoch from (least(win_e, r.c_e) - greatest(win_s, r.c_s))) / 60)::int;
        conflicts := conflicts || jsonb_build_object(
          'subject', r.subject_name, 'course_code', r.course_code, 'room', r.room,
          'date', d,
          'class_start', r.c_s, 'class_end', r.c_e,
          'overlap_start', greatest(win_s, r.c_s), 'overlap_end', least(win_e, r.c_e),
          'overlap_minutes', round(extract(epoch from (least(win_e, r.c_e) - greatest(win_s, r.c_s))) / 60)::int);
      end loop;
    end if;
    d := d + 1;
  end loop;

  -- Classes in one timetable can't overlap each other (exclusion
  -- constraint), so adding the overlaps never double-counts a minute.
  status := case
    when total >= ev_minutes then 'full_conflict'
    when total > 0 then 'partial_conflict'
    when complete then 'no_conflict'
    else 'timetable_not_configured'
  end;

  return jsonb_build_object(
    'status', status,
    'event_minutes', ev_minutes,
    'overlap_minutes', least(total, ev_minutes),
    'free_minutes', greatest(ev_minutes - total, 0),
    'timetable_complete', complete,
    'od_eligible', p_event.od_eligible,
    'conflicts', conflicts);
end;
$$;

-- Public wrapper: a signed-in student checks THEIR OWN timetable against a
-- published event. (No way to probe someone else's timetable.)
create or replace function public.check_timetable_conflict(p_event_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  e public.events;
begin
  if auth.uid() is null then
    raise exception 'Sign in to check your timetable.' using errcode = '42501';
  end if;
  select * into e from public.events where id = p_event_id and status = 'published';
  if not found then
    raise exception 'This event is not open.' using errcode = 'P0002';
  end if;
  return public._timetable_conflict(e, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Registration (transaction-safe capacity)
-- ---------------------------------------------------------------------
-- RACE CONDITION, explained: two students click Register for the last seat
-- at the same moment. If each request counted seats, saw "1 left" and
-- inserted, the event would be over capacity. Here the first statement
-- locks the event row (FOR UPDATE). The second request WAITS until the
-- first transaction commits, then counts again, sees 0 left, and is refused.
create or replace function public.register_for_event(p_event_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events := public._lock_event(p_event_id);   -- serialises registrations for this event
  me uuid := auth.uid();
  taken int;
  conflict jsonb;
  allow_full boolean;
  reg public.event_registrations;
begin
  if me is null or not public.has_role('student') then
    raise exception 'Only signed-in students can register for events.' using errcode = '42501';
  end if;
  if e.status <> 'published' then
    raise exception 'This event is not open for registration.' using errcode = 'P0001';
  end if;
  if now() < e.registration_opens_at then
    raise exception 'Registration opens on %.', to_char(e.registration_opens_at at time zone public._campus_tz(), 'DD Mon at HH24:MI') using errcode = 'P0001';
  end if;
  if now() >= e.registration_closes_at then
    raise exception 'Registration for this event has closed.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.event_registrations r where r.event_id = e.id and r.student_id = me and r.status = 'registered') then
    raise exception 'You are already registered for this event.' using errcode = '23505';
  end if;

  select count(*) into taken from public.event_registrations r where r.event_id = e.id and r.status = 'registered';
  if taken >= e.capacity then
    raise exception 'This event is full.' using errcode = 'P0001';
  end if;

  conflict := public._timetable_conflict(e, me);
  select coalesce((value #>> '{}')::boolean, true) into allow_full
    from public.platform_settings where key = 'allow_registration_on_full_conflict';
  if conflict->>'status' = 'full_conflict' and not e.od_eligible and not coalesce(allow_full, true) then
    raise exception 'This event clashes completely with your classes and is not OD-eligible.' using errcode = 'P0001';
  end if;

  insert into public.event_registrations (event_id, student_id, conflict_status, conflict_minutes)
  values (e.id, me, (conflict->>'status')::public.conflict_status, (conflict->>'overlap_minutes')::int)
  returning * into reg;

  perform public.notify(me, 'registration_confirmed', 'You’re registered',
    format('See you at "%s".', e.title), 'event', e.id, format('registration:%s', reg.id));

  return jsonb_build_object('registration_id', reg.id, 'pass_code', reg.pass_code,
                            'seats_left', e.capacity - taken - 1, 'conflict', conflict);
end;
$$;

-- Cancel your own registration, until the registration deadline (decision D9).
create or replace function public.cancel_registration(p_event_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events := public._lock_event(p_event_id);
  reg public.event_registrations;
begin
  select * into reg from public.event_registrations r
  where r.event_id = e.id and r.student_id = auth.uid() and r.status = 'registered' for update;
  if not found then
    raise exception 'You are not registered for this event.' using errcode = 'P0002';
  end if;
  if now() >= e.registration_closes_at and e.status = 'published' then
    raise exception 'Registrations can only be cancelled until the registration deadline.' using errcode = 'P0001';
  end if;

  update public.event_registrations set status = 'cancelled', cancelled_at = now() where id = reg.id;
  -- An OD request makes no sense without a registration.
  update public.od_requests set status = 'withdrawn' where registration_id = reg.id and status in ('pending', 'approved');
  perform public.notify(auth.uid(), 'registration_cancelled', 'Registration cancelled',
    format('Your place at "%s" was released.', e.title), 'event', e.id, format('registration:%s:cancelled', reg.id));
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Seat counts (numbers only, never who)
-- ---------------------------------------------------------------------
create or replace function public.get_event_seats(p_event_ids uuid[])
returns table (event_id uuid, registered int, capacity int)
language sql stable security definer
set search_path = ''
as $$
  select e.id,
         (select count(*)::int from public.event_registrations r where r.event_id = e.id and r.status = 'registered'),
         e.capacity
  from public.events e
  where e.id = any (p_event_ids)
    and e.status in ('published', 'completed', 'cancelled') and e.published_at is not null
$$;

-- ---------------------------------------------------------------------
-- 4. Campus-wide scheduling warnings (advice for the DSA, not a block)
-- ---------------------------------------------------------------------
-- A WARNING (unlike a venue clash, which is a hard block) when two events
-- of at least the configured scope (default: department) overlap in time
-- AND could draw the same students: their audiences intersect. An event
-- with no audience rows targets everyone. NULL department/year = "all".
create or replace function public.event_scheduling_warnings(p_event_id uuid)
returns table (other_event_id uuid, other_title text, other_club text, other_venue text, other_scope public.event_scope,
               other_status public.event_status, starts_at timestamptz, ends_at timestamptz, reason text)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  e public.events;
  min_scope public.event_scope;
begin
  select * into e from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if not (public.is_club_manager(e.club_id) or public.has_role('dsa', 'admin')) then
    raise exception 'Only the club’s organizers, DSA or admins can view scheduling warnings.' using errcode = '42501';
  end if;
  select coalesce((value #>> '{}')::public.event_scope, 'department') into min_scope
    from public.platform_settings where key = 'campus_warning_min_scope';
  min_scope := coalesce(min_scope, 'department');

  if e.scope < min_scope then
    return;  -- small club events don't trigger campus-wide warnings
  end if;

  return query
  select o.id, o.title, c.name, v.name, o.scope, o.status, o.starts_at, o.ends_at,
         case when not exists (select 1 from public.event_audiences a where a.event_id = o.id)
                or not exists (select 1 from public.event_audiences a where a.event_id = e.id)
              then 'Overlaps in time and targets all students'
              else 'Overlaps in time with a shared audience' end
  from public.events o
  join public.clubs c on c.id = o.club_id
  left join public.venues v on v.id = o.venue_id
  where o.id <> e.id
    and o.scope >= min_scope
    and o.status in ('submitted', 'under_review', 'changes_requested', 'approved', 'published')
    and tstzrange(o.starts_at, o.ends_at, '[)') && tstzrange(e.starts_at, e.ends_at, '[)')
    and (
      not exists (select 1 from public.event_audiences a where a.event_id = o.id)
      or not exists (select 1 from public.event_audiences a where a.event_id = e.id)
      or exists (
        select 1 from public.event_audiences a1 join public.event_audiences a2 on true
        where a1.event_id = e.id and a2.event_id = o.id
          and (a1.department_id is null or a2.department_id is null or a1.department_id = a2.department_id)
          and (a1.academic_year is null or a2.academic_year is null or a1.academic_year = a2.academic_year)))
  order by o.starts_at;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Registrant list for organizers (limited fields; profiles stay private)
-- ---------------------------------------------------------------------
create or replace function public.get_event_registrants(p_event_id uuid)
returns table (registration_id uuid, full_name text, registration_number text, department_code text,
               academic_year smallint, status public.registration_status, conflict_status public.conflict_status,
               conflict_minutes int, registered_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  e public.events;
begin
  select * into e from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if not (public.is_club_manager(e.club_id) or public.has_role('dsa', 'admin')) then
    raise exception 'Only the club’s organizers, DSA or admins can see registrants.' using errcode = '42501';
  end if;
  return query
  select r.id, p.full_name, p.registration_number, d.code, p.academic_year, r.status, r.conflict_status, r.conflict_minutes, r.registered_at
  from public.event_registrations r
  join public.profiles p on p.id = r.student_id
  left join public.departments d on d.id = p.department_id
  where r.event_id = e.id
  order by r.status, r.registered_at;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------
revoke execute on function public._timetable_conflict(public.events, uuid) from public, anon, authenticated;

revoke execute on function public.check_timetable_conflict(uuid) from public, anon;
revoke execute on function public.register_for_event(uuid) from public, anon;
revoke execute on function public.cancel_registration(uuid) from public, anon;
revoke execute on function public.event_scheduling_warnings(uuid) from public, anon;
revoke execute on function public.get_event_registrants(uuid) from public, anon;
revoke execute on function public.get_event_seats(uuid[]) from public;

grant execute on function public.check_timetable_conflict(uuid) to authenticated;
grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.cancel_registration(uuid) to authenticated;
grant execute on function public.event_scheduling_warnings(uuid) to authenticated;
grant execute on function public.get_event_registrants(uuid) to authenticated;
grant execute on function public.get_event_seats(uuid[]) to anon, authenticated;
