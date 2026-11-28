-- =====================================================================
-- CampusSync migration 13: a "Lunch" entry in a timetable is free time
-- ---------------------------------------------------------------------
-- Sections take lunch in different periods (4 or 5), so the bell schedule
-- never assumes one. A student marks it by adding an entry named "Lunch"
-- (also "Lunch break", "Lunch hour", "Lunch time"; any capitals). Such
-- entries still show in the timetable but are skipped by the clash check,
-- so an event during lunch is not reported as a class conflict.
-- They still count as "timetable entered" for that term.
-- =====================================================================

-- Private helper (not callable through the API).
create or replace function public._is_lunch(p_subject text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_subject, ''))) ~ '^lunch( break| hour| time)?$';
$$;
revoke all on function public._is_lunch(text) from public, anon, authenticated;

-- Same function as migration 9, with lunch entries skipped. Existing
-- grants are kept by CREATE OR REPLACE.
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
          and not public._is_lunch(s.subject_name)               -- lunch is free time (migration 13)
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
