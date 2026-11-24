-- =====================================================================
-- CampusSync migration 8 — Stage 5: event proposal & approval workflow
-- ---------------------------------------------------------------------
-- Lifecycle (docs/SCHEMA_PROPOSAL.md §6):
--   draft → submitted → under_review → approved | rejected | changes_requested
--   changes_requested → submitted (resubmit)      rejected → draft (revise)
--   approved → published → completed               (most states) → cancelled
--
-- WHY FUNCTIONS (RPCs) INSTEAD OF PLAIN UPDATEs?
-- Browser users have no privilege on events.status at all (migration 7),
-- so the ONLY way to move an event through its lifecycle is to call one
-- of the functions below. Each one, inside a single transaction:
--   1. locks the event row (SELECT … FOR UPDATE), so two people acting at
--      the same moment are handled one after the other;
--   2. checks WHO is calling (club manager / DSA / admin);
--   3. checks the event is in the right state and its data is valid;
--   4. changes the status, writes the audit log, sends notifications.
-- A trigger additionally refuses any status jump that isn't on the map,
-- even for the database owner. That's defence in depth.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Transition guard (applies to EVERY update, including the owner's)
-- ---------------------------------------------------------------------
create or replace function public.enforce_event_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and (old.status::text || '>' || new.status::text) <> all (array[
       'draft>submitted', 'draft>cancelled',
       'submitted>under_review', 'submitted>approved', 'submitted>rejected',
       'submitted>changes_requested', 'submitted>cancelled',
       'under_review>approved', 'under_review>rejected',
       'under_review>changes_requested', 'under_review>cancelled',
       'changes_requested>submitted', 'changes_requested>cancelled',
       'rejected>draft',
       'approved>published', 'approved>cancelled',
       'published>completed', 'published>cancelled'
     ]) then
    raise exception 'Invalid event status change: % → %', old.status, new.status
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger events_enforce_transition
  before update of status on public.events
  for each row execute function public.enforce_event_transition();

-- ---------------------------------------------------------------------
-- 2. Internal helpers (not callable from the browser)
-- ---------------------------------------------------------------------
create or replace function public._campus_tz()
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select value #>> '{}' from public.platform_settings where key = 'campus_timezone'), 'Asia/Kolkata')
$$;

-- Lock and return the event, or fail clearly.
create or replace function public._lock_event(p_event_id uuid)
returns public.events
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events;
begin
  select * into e from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  return e;
end;
$$;

-- Human-readable description of a venue clash, or NULL if the slot is free.
-- (The exclusion constraint is the real guarantee; this gives a friendly
-- message naming the other event.)
create or replace function public._venue_clash(p_event public.events)
returns text
language sql stable security definer
set search_path = ''
as $$
  select format('%s is already booked for "%s" (%s – %s).',
                v.name, o.title,
                to_char(o.starts_at at time zone public._campus_tz(), 'DD Mon, HH24:MI'),
                to_char(o.ends_at at time zone public._campus_tz(), 'DD Mon, HH24:MI'))
  from public.events o
  join public.venues v on v.id = o.venue_id
  where o.venue_id = p_event.venue_id
    and o.id <> p_event.id
    and o.status in ('submitted', 'under_review', 'changes_requested', 'approved', 'published', 'completed')
    and tstzrange(o.starts_at, o.ends_at, '[)') && tstzrange(p_event.starts_at, p_event.ends_at, '[)')
  order by o.starts_at
  limit 1
$$;

-- Validation shared by submit and approve.
create or replace function public._assert_event_schedulable(p_event public.events)
returns void
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v public.venues;
  clash text;
begin
  if p_event.venue_id is null then
    raise exception 'Choose a venue before submitting.' using errcode = 'P0001';
  end if;
  select * into v from public.venues where id = p_event.venue_id;
  if not found or not v.is_active then
    raise exception 'The chosen venue is not available.' using errcode = 'P0001';
  end if;
  if p_event.capacity > v.capacity then
    raise exception 'Capacity (%) is larger than % can hold (%).', p_event.capacity, v.name, v.capacity using errcode = 'P0001';
  end if;
  if p_event.starts_at <= now() then
    raise exception 'The event must start in the future.' using errcode = 'P0001';
  end if;
  if p_event.registration_closes_at <= now() then
    raise exception 'The registration deadline has already passed. Move it later.' using errcode = 'P0001';
  end if;
  clash := public._venue_clash(p_event);
  if clash is not null then
    raise exception '%', clash using errcode = '23P01';  -- 23P01 = exclusion_violation
  end if;
end;
$$;

-- Notify the event's creator and every active manager of its club.
create or replace function public._notify_event_team(
  p_event public.events, p_type text, p_title text, p_message text, p_dedupe text)
returns void
language sql security definer
set search_path = ''
as $$
  select public.notify(r.id, p_type, p_title, p_message, 'event', p_event.id, p_dedupe)
  from (
    select p_event.created_by as id
    union
    select m.user_id from public.club_members m
    where m.club_id = p_event.club_id and m.membership_status = 'active'
      and m.membership_role in ('lead', 'coordinator')
  ) r
$$;

revoke execute on function public._campus_tz() from public, anon, authenticated;
revoke execute on function public._lock_event(uuid) from public, anon, authenticated;
revoke execute on function public._venue_clash(public.events) from public, anon, authenticated;
revoke execute on function public._assert_event_schedulable(public.events) from public, anon, authenticated;
revoke execute on function public._notify_event_team(public.events, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Organizer actions
-- ---------------------------------------------------------------------

-- Submit a draft (or a proposal sent back with requested changes).
create or replace function public.submit_event(p_event_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events := public._lock_event(p_event_id);
  stamp bigint := extract(epoch from clock_timestamp())::bigint;
begin
  if not public.is_club_manager(e.club_id) then
    raise exception 'Only organizers who manage this club can submit its events.' using errcode = '42501';
  end if;
  if e.status not in ('draft', 'changes_requested') then
    raise exception 'Only drafts or proposals with requested changes can be submitted (this one is %).', e.status using errcode = 'P0001';
  end if;
  perform public._assert_event_schedulable(e);

  begin
    update public.events
       set status = 'submitted', submitted_at = now(),
           reviewed_by = null, reviewed_at = null, review_note = null
     where id = e.id;
  exception when exclusion_violation then
    -- Another proposal grabbed the venue in the same instant.
    raise exception 'That venue was just booked for an overlapping time. Choose another time or venue.' using errcode = '23P01';
  end;

  perform public.write_audit('event.submit', 'event', e.id, jsonb_build_object('from', e.status));
  perform public.notify(p.id, 'event_submitted', 'New event proposal',
                        format('"%s" is waiting for review.', e.title), 'event', e.id,
                        format('event:%s:submitted:%s', e.id, stamp))
  from public.profiles p where p.role = 'dsa' and p.is_active;
end;
$$;

-- Turn a rejected proposal back into an editable draft (keeps the DSA note).
create or replace function public.reopen_event(p_event_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events := public._lock_event(p_event_id);
begin
  if not public.is_club_manager(e.club_id) then
    raise exception 'Only organizers who manage this club can revise its events.' using errcode = '42501';
  end if;
  if e.status <> 'rejected' then
    raise exception 'Only rejected proposals can be reopened as drafts.' using errcode = 'P0001';
  end if;
  update public.events set status = 'draft' where id = e.id;
  perform public.write_audit('event.reopen', 'event', e.id, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. DSA review
-- ---------------------------------------------------------------------
create or replace function public.start_event_review(p_event_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events := public._lock_event(p_event_id);
begin
  if not public.has_role('dsa') then
    raise exception 'Only DSA reviewers can review proposals.' using errcode = '42501';
  end if;
  if e.status <> 'submitted' then
    raise exception 'Only newly submitted proposals can be taken into review.' using errcode = 'P0001';
  end if;
  update public.events set status = 'under_review' where id = e.id;
  perform public.write_audit('event.start_review', 'event', e.id, '{}'::jsonb);
  perform public._notify_event_team(e, 'event_under_review', 'Proposal under review',
    format('The DSA has started reviewing "%s".', e.title), format('event:%s:under_review:%s', e.id, extract(epoch from e.submitted_at)::bigint));
end;
$$;

-- p_decision: 'approve' | 'reject' | 'request_changes'
create or replace function public.review_event(p_event_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events := public._lock_event(p_event_id);
  new_status public.event_status;
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.has_role('dsa') then
    raise exception 'Only DSA reviewers can decide on proposals.' using errcode = '42501';
  end if;
  if e.created_by = auth.uid() then
    raise exception 'You cannot review a proposal you created.' using errcode = '42501';
  end if;
  if e.status not in ('submitted', 'under_review') then
    raise exception 'This proposal is not awaiting a decision (it is %).', e.status using errcode = 'P0001';
  end if;

  new_status := case p_decision
    when 'approve' then 'approved'::public.event_status
    when 'reject' then 'rejected'::public.event_status
    when 'request_changes' then 'changes_requested'::public.event_status
  end;
  if new_status is null then
    raise exception 'Unknown decision "%".', p_decision using errcode = '22023';
  end if;
  if new_status <> 'approved' and length(coalesce(note, '')) < 10 then
    raise exception 'Please give a reason of at least 10 characters.' using errcode = 'P0001';
  end if;
  if new_status = 'approved' then
    -- Re-check at the moment of approval: the venue, capacity and dates
    -- may have changed since submission.
    perform public._assert_event_schedulable(e);
  end if;

  update public.events
     set status = new_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = note
   where id = e.id;

  perform public.write_audit('event.' || p_decision, 'event', e.id,
    jsonb_build_object('from', e.status, 'to', new_status, 'note', note));
  perform public._notify_event_team(e,
    'event_' || new_status::text,
    case new_status when 'approved' then 'Proposal approved'
                    when 'rejected' then 'Proposal rejected'
                    else 'Changes requested' end,
    case when note is null then format('"%s" was %s.', e.title, replace(new_status::text, '_', ' '))
         else format('"%s": %s', e.title, note) end,
    format('event:%s:%s:%s', e.id, new_status, extract(epoch from now())::bigint));
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Publication, completion, cancellation
-- ---------------------------------------------------------------------
create or replace function public.publish_event(p_event_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events := public._lock_event(p_event_id);
  club_name text;
begin
  if not (public.is_club_manager(e.club_id) or public.has_role('dsa')) then
    raise exception 'Only the club’s organizers or the DSA can publish this event.' using errcode = '42501';
  end if;
  if e.status <> 'approved' then
    raise exception 'Only approved events can be published.' using errcode = 'P0001';
  end if;
  if e.starts_at <= now() then
    raise exception 'This event has already started.' using errcode = 'P0001';
  end if;
  update public.events set status = 'published', published_at = now() where id = e.id;

  select name into club_name from public.clubs where id = e.club_id;
  perform public.write_audit('event.publish', 'event', e.id, '{}'::jsonb);
  perform public._notify_event_team(e, 'event_published', 'Event published',
    format('"%s" is now live on Discover.', e.title), format('event:%s:published', e.id));
  -- Followers of the club hear about it (club_follows).
  perform public.notify(f.student_id, 'club_event_published', format('New from %s', club_name),
                        format('"%s" is open on CampusSync.', e.title), 'event', e.id, format('event:%s:published', e.id))
  from public.club_follows f where f.club_id = e.club_id;
end;
$$;

create or replace function public.complete_event(p_event_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events := public._lock_event(p_event_id);
begin
  if not (public.is_club_manager(e.club_id) or public.has_role('dsa', 'admin')) then
    raise exception 'You cannot complete this event.' using errcode = '42501';
  end if;
  if e.status <> 'published' then
    raise exception 'Only published events can be marked completed.' using errcode = 'P0001';
  end if;
  if now() < e.ends_at then
    raise exception 'The event has not ended yet.' using errcode = 'P0001';
  end if;
  update public.events set status = 'completed' where id = e.id;
  perform public.write_audit('event.complete', 'event', e.id, '{}'::jsonb);
end;
$$;

create or replace function public.cancel_event(p_event_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events := public._lock_event(p_event_id);
  reason text := trim(coalesce(p_reason, ''));
begin
  if not (public.is_club_manager(e.club_id) or public.has_role('dsa', 'admin')) then
    raise exception 'You cannot cancel this event.' using errcode = '42501';
  end if;
  if e.status in ('cancelled', 'completed', 'rejected') then
    raise exception 'A % event cannot be cancelled.', e.status using errcode = 'P0001';
  end if;
  if length(reason) < 10 then
    raise exception 'Please give a cancellation reason of at least 10 characters.' using errcode = 'P0001';
  end if;
  update public.events
     set status = 'cancelled', cancelled_at = now(), cancellation_reason = reason
   where id = e.id;

  perform public.write_audit('event.cancel', 'event', e.id, jsonb_build_object('from', e.status, 'reason', reason));
  perform public._notify_event_team(e, 'event_cancelled', 'Event cancelled',
    format('"%s" was cancelled: %s', e.title, reason), format('event:%s:cancelled', e.id));
  -- Everyone registered hears about it (only possible once published).
  perform public.notify(r.student_id, 'event_cancelled', 'Event cancelled',
                        format('"%s" was cancelled: %s', e.title, reason), 'event', e.id, format('event:%s:cancelled', e.id))
  from public.event_registrations r where r.event_id = e.id and r.status = 'registered';
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Who may call what (the functions re-check roles inside anyway)
-- ---------------------------------------------------------------------
revoke execute on function public.submit_event(uuid) from public, anon;
revoke execute on function public.reopen_event(uuid) from public, anon;
revoke execute on function public.start_event_review(uuid) from public, anon;
revoke execute on function public.review_event(uuid, text, text) from public, anon;
revoke execute on function public.publish_event(uuid) from public, anon;
revoke execute on function public.complete_event(uuid) from public, anon;
revoke execute on function public.cancel_event(uuid, text) from public, anon;
grant execute on function public.submit_event(uuid) to authenticated;
grant execute on function public.reopen_event(uuid) to authenticated;
grant execute on function public.start_event_review(uuid) to authenticated;
grant execute on function public.review_event(uuid, text, text) to authenticated;
grant execute on function public.publish_event(uuid) to authenticated;
grant execute on function public.complete_event(uuid) to authenticated;
grant execute on function public.cancel_event(uuid, text) to authenticated;
