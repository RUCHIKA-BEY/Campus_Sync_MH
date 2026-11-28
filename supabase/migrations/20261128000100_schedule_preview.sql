-- =====================================================================
-- CampusSync migration 14: timetable check for a time window (preview)
-- ---------------------------------------------------------------------
-- Why: Discover shows labelled SAMPLE events while no real event is
-- published. They live only in the browser, so check_timetable_conflict
-- (which takes an event id) can't check them, and students saw no clash
-- warning at all. This function checks the SIGNED-IN student's own
-- timetable against a start/end time, using the exact same rule
-- (_timetable_conflict, migrations 9 and 13). Nothing is stored.
--
-- Privacy: it only ever reads the caller's own timetable (auth.uid()),
-- which they can already read through RLS. Nobody can probe another
-- student's schedule with it.
-- Registration is unchanged: register_for_event still decides from the
-- event row in the database.
-- =====================================================================

create or replace function public.check_timetable_window(p_starts_at timestamptz, p_ends_at timestamptz)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  e public.events;   -- a transient row: only the times are used
begin
  if auth.uid() is null then
    raise exception 'Sign in to check your timetable.' using errcode = '42501';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'The end time must be after the start time.' using errcode = '22023';
  end if;
  if p_ends_at - p_starts_at > interval '14 days' then
    raise exception 'Time window is too long to check.' using errcode = '22023';
  end if;
  e.starts_at := p_starts_at;
  e.ends_at := p_ends_at;
  e.od_eligible := false;
  return public._timetable_conflict(e, auth.uid());
end;
$$;

revoke execute on function public.check_timetable_window(timestamptz, timestamptz) from public, anon;
grant execute on function public.check_timetable_window(timestamptz, timestamptz) to authenticated;
