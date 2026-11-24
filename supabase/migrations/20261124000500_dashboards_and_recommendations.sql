-- =====================================================================
-- CampusSync migration 11 — Stage 8: dashboards & recommendations
-- ---------------------------------------------------------------------
-- Every dashboard number is computed IN the database by one aggregate
-- function per role (no downloading tables to count in the browser), and
-- each function checks the caller's role first.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Student dashboard (always about the caller)
-- ---------------------------------------------------------------------
create or replace function public.student_dashboard()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in to see your dashboard.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'upcoming_registrations', (select count(*) from public.event_registrations r join public.events e on e.id = r.event_id
                               where r.student_id = me and r.status = 'registered' and e.status = 'published' and e.ends_at > now()),
    'pending_od', (select count(*) from public.od_requests where student_id = me and status = 'pending'),
    'approved_od', (select count(*) from public.od_requests where student_id = me and status = 'approved'),
    'events_attended', (select count(*) from public.attendance_records where student_id = me and verification_status = 'verified'),
    'clubs_followed', (select count(*) from public.club_follows where student_id = me),
    'active_clubs', (select count(*) from public.clubs where status = 'active'),
    'upcoming_public_events', (select count(*) from public.events where status = 'published' and ends_at > now()),
    'timetable_classes', (select count(*) from public.timetable_slots s join public.academic_terms t on t.id = s.term_id
                          where s.student_id = me and current_date between t.starts_on and t.ends_on),
    'interests', (select count(*) from public.student_interests where student_id = me)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Organizer dashboard (clubs the caller manages)
-- ---------------------------------------------------------------------
create or replace function public.organizer_dashboard()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clubs uuid[];
begin
  if not public.has_role('organizer') then
    raise exception 'Only organizers have an organizer dashboard.' using errcode = '42501';
  end if;
  select coalesce(array_agg(club_id), '{}') into clubs from public.club_members
  where user_id = me and membership_status = 'active' and membership_role in ('lead', 'coordinator');

  return (
    with ev as (select * from public.events where club_id = any (clubs)),
         reg as (select r.* from public.event_registrations r join ev on ev.id = r.event_id where r.status = 'registered'),
         past as (select id from ev where status in ('published', 'completed') and starts_at <= now()),
         past_reg as (select count(*) n from reg where event_id in (select id from past)),
         past_att as (select count(*) n from public.attendance_records a
                      where a.event_id in (select id from past) and a.verification_status = 'verified')
    select jsonb_build_object(
      'total_events', (select count(*) from ev),
      'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from ev group by status) s), '{}'),
      'total_registrations', (select count(*) from reg),
      'seats_available', coalesce((select sum(greatest(ev.capacity - (select count(*) from reg where reg.event_id = ev.id), 0))
                                   from ev where ev.status = 'published' and ev.ends_at > now()), 0),
      'attendance_rate', case when (select n from past_reg) = 0 then null
                              else round(100.0 * (select n from past_att) / (select n from past_reg), 1) end,
      'upcoming', coalesce((
        select jsonb_agg(x order by x->>'starts_at') from (
          select jsonb_build_object('id', ev.id, 'title', ev.title, 'starts_at', ev.starts_at, 'status', ev.status,
                                    'capacity', ev.capacity, 'registered', (select count(*) from reg where reg.event_id = ev.id),
                                    'checked_in', (select count(*) from public.attendance_records a where a.event_id = ev.id and a.verification_status = 'verified')) x
          from ev where ev.status in ('approved', 'published') and ev.ends_at > now()
          order by ev.starts_at limit 8) t), '[]')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. DSA dashboard
-- ---------------------------------------------------------------------
create or replace function public.dsa_dashboard()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.has_role('dsa', 'admin') then
    raise exception 'Only DSA and admins have this dashboard.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'awaiting_review', (select count(*) from public.events where status in ('submitted', 'under_review')),
    'changes_requested', (select count(*) from public.events where status = 'changes_requested'),
    'approved_30d', (select count(*) from public.events where reviewed_at > now() - interval '30 days' and status in ('approved', 'published', 'completed')),
    'rejected_30d', (select count(*) from public.events where reviewed_at > now() - interval '30 days' and status = 'rejected'),
    'published_upcoming', (select count(*) from public.events where status = 'published' and ends_at > now()),
    -- Average hours from submission to decision, last 30 days.
    'avg_decision_hours', (select round((avg(extract(epoch from (reviewed_at - submitted_at))) / 3600)::numeric, 1)
                           from public.events where reviewed_at > now() - interval '30 days' and submitted_at is not null),
    'od_pending', (select count(*) from public.od_requests where status = 'pending'),
    'od_approved_30d', (select count(*) from public.od_requests where status = 'approved' and reviewed_at > now() - interval '30 days'),
    'od_rejected_30d', (select count(*) from public.od_requests where status = 'rejected' and reviewed_at > now() - interval '30 days')
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Admin dashboard (platform-wide)
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  tz text := public._campus_tz();
begin
  if not public.has_role('admin') then
    raise exception 'Only administrators have the admin dashboard.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users_by_role', coalesce((select jsonb_object_agg(role, n) from (select role, count(*) n from public.profiles group by role) s), '{}'),
    'active_clubs', (select count(*) from public.clubs where status = 'active'),
    'venues', (select count(*) from public.venues where is_active),
    'events_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.events group by status) s), '{}'),
    'upcoming_published', (select count(*) from public.events where status = 'published' and ends_at > now()),
    'registrations_active', (select count(*) from public.event_registrations where status = 'registered'),
    'attendance_verified', (select count(*) from public.attendance_records where verification_status = 'verified'),
    'attendance_rate', (select case when count(*) = 0 then null
                               else round(100.0 * count(a.id) / count(*), 1) end
                        from public.event_registrations r
                        join public.events e on e.id = r.event_id and e.starts_at <= now() and e.status in ('published', 'completed')
                        left join public.attendance_records a on a.registration_id = r.id and a.verification_status = 'verified'
                        where r.status = 'registered'),
    'od_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.od_requests group by status) s), '{}'),
    -- Registrations per campus day for the last 14 days (zero-filled).
    'registrations_14d', (select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(c.n, 0)) order by d)
                          from generate_series((now() at time zone tz)::date - 13, (now() at time zone tz)::date, interval '1 day') d
                          left join (select (registered_at at time zone tz)::date as reg_day, count(*) as n from public.event_registrations
                                     where registered_at > now() - interval '15 days' group by 1) c on c.reg_day = d::date),
    'events_by_category', coalesce((select jsonb_agg(jsonb_build_object('category', c.name, 'n', n) order by n desc)
                                    from (select category_id, count(*) n from public.events where status in ('published', 'completed') group by category_id) x
                                    join public.categories c on c.id = x.category_id), '[]')
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Recommendations (transparent, rule-based)
-- ---------------------------------------------------------------------
-- Candidates: published events open for registration now, starting within
-- 60 days, that the student hasn't registered for. Score:
--   +3  category is one of the student's interests
--   +2  organized by a club the student follows
--   +1  category matches events the student registered for before
--   +2  fits the timetable (no class conflict)     −1 if it partly clashes
-- Each row returns the reasons, so the UI can say WHY it was suggested.
-- Only the caller's own data is used; nothing about other students.
create or replace function public.recommended_events(p_limit int default 6)
returns table (event_id uuid, score int, reasons text[], conflict_status public.conflict_status)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  e public.events;
  s int;
  why text[];
  c jsonb;
begin
  if me is null then
    raise exception 'Sign in to get recommendations.' using errcode = '42501';
  end if;
  for e in
    select ev.* from public.events ev
    where ev.status = 'published' and now() >= ev.registration_opens_at and now() < ev.registration_closes_at
      and ev.starts_at < now() + interval '60 days'
      and not exists (select 1 from public.event_registrations r where r.event_id = ev.id and r.student_id = me and r.status = 'registered')
      and (select count(*) from public.event_registrations r where r.event_id = ev.id and r.status = 'registered') < ev.capacity
    order by ev.starts_at
    limit 50
  loop
    s := 0; why := '{}';
    if exists (select 1 from public.student_interests i where i.student_id = me and i.category_id = e.category_id) then
      s := s + 3; why := array_append(why, 'Matches your interests');
    end if;
    if exists (select 1 from public.club_follows f where f.student_id = me and f.club_id = e.club_id) then
      s := s + 2; why := array_append(why, 'From a club you follow');
    end if;
    if exists (select 1 from public.event_registrations r join public.events pe on pe.id = r.event_id
               where r.student_id = me and pe.category_id = e.category_id and pe.id <> e.id) then
      s := s + 1; why := array_append(why, 'Like events you joined before');
    end if;
    c := public._timetable_conflict(e, me);
    if c->>'status' = 'no_conflict' then
      s := s + 2; why := array_append(why, 'Fits your timetable');
    elsif c->>'status' = 'partial_conflict' then
      s := s - 1;
    end if;
    if s > 0 then
      event_id := e.id; score := s; reasons := why; conflict_status := (c->>'status')::public.conflict_status;
      return next;
    end if;
  end loop;
end;
$$;

-- The loop above returns unsorted rows; this wrapper sorts and limits.
create or replace function public.get_recommendations(p_limit int default 6)
returns table (event_id uuid, score int, reasons text[], conflict_status public.conflict_status)
language sql stable security definer
set search_path = ''
as $$
  select * from public.recommended_events(p_limit)
  order by score desc, event_id
  limit greatest(1, least(coalesce(p_limit, 6), 20))
$$;

-- ---------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.student_dashboard()', 'public.organizer_dashboard()', 'public.dsa_dashboard()',
    'public.admin_dashboard()', 'public.get_recommendations(integer)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
-- Internal: only reachable through get_recommendations.
revoke execute on function public.recommended_events(integer) from public, anon, authenticated;
