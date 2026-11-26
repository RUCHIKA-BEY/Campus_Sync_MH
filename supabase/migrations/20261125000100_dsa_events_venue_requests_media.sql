-- =====================================================================
-- CampusSync migration 12: DSA-hosted events, venue requests, event media
-- =====================================================================
-- 1. DSA events. The Office of the DSA hosts its own events (fests,
--    cultural nights, prom). It is modelled as one special host club
--    (clubs.is_dsa_office). Every active DSA member manages that club's
--    events with the same tools organizers have.
-- 2. DSA head. One DSA account, identified by the e-mail address in
--    platform_settings.dsa_head_email (no new role), approves DSA
--    events. Nobody approves their own event: if the head created it,
--    another DSA member reviews it. Club events: any DSA member, as before.
-- 3. Venue requests. A proposal may ask for a venue that is not on the
--    official list (name, building, capacity). When the DSA approves it,
--    the venue is added to the list (or the existing venue with that
--    name is reused) and booked, so the double-booking rule still holds.
-- 4. Event media. Organizers upload a poster (cards, page background)
--    and a wide banner (event page header) to the public Storage bucket
--    'event-media' (JPG/PNG/WebP, max 2 MB). Only the event's managers
--    may upload, and only while the event is editable.
-- Depends on migrations 1–11.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------
alter table public.clubs
  add column if not exists is_dsa_office boolean not null default false;
-- At most one DSA office.
create unique index if not exists clubs_one_dsa_office on public.clubs (is_dsa_office) where is_dsa_office;

alter table public.events
  add column if not exists banner_url text,
  add column if not exists requested_venue_name text,
  add column if not exists requested_venue_building text,
  add column if not exists requested_venue_capacity integer;

alter table public.events
  -- Images must be ordinary https URLs (never javascript:/data:).
  add constraint events_poster_url_https check (poster_url is null or poster_url ~ '^https://'),
  add constraint events_banner_url_https check (banner_url is null or banner_url ~ '^https://'),
  -- A venue request is all-or-nothing and sensible.
  add constraint events_venue_request_complete check (
    (requested_venue_name is null and requested_venue_building is null and requested_venue_capacity is null)
    or (length(trim(requested_venue_name)) between 2 and 120
        and requested_venue_capacity is not null and requested_venue_capacity > 0
        and (requested_venue_building is null or length(trim(requested_venue_building)) <= 120))
  );

-- Replace "venue required after draft": a proposal waiting for a DSA
-- decision may carry a venue REQUEST instead of a listed venue. Approved,
-- published and completed events always have a real venue.
alter table public.events drop constraint events_venue_required;
alter table public.events add constraint events_venue_required check (
  venue_id is not null
  or status in ('draft', 'cancelled')
  or (requested_venue_name is not null
      and status in ('submitted', 'under_review', 'changes_requested', 'rejected'))
);

-- Organizers may write the new descriptive columns (never status).
grant insert (banner_url, requested_venue_name, requested_venue_building, requested_venue_capacity)
  on public.events to authenticated;
grant update (banner_url, requested_venue_name, requested_venue_building, requested_venue_capacity)
  on public.events to authenticated;

-- The DSA office host club and the head's e-mail (admin-editable).
insert into public.clubs (name, short_name, description, category_id, is_dsa_office)
values ('Office of the DSA', 'DSA',
        'Campus-wide fests, cultural evenings and flagship events hosted by the Office of the Dean of Student Affairs.',
        (select id from public.categories where slug = 'community'), true)
on conflict (name) do update set is_dsa_office = true;

insert into public.platform_settings (key, value, description)
values ('dsa_head_email', '"dsa.head@campussync.test"',
        'E-mail of the DSA head: the DSA account that approves events hosted by the Office of the DSA.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------
-- Club scope: organizers who lead/coordinate the club (decision D4), and
-- every active DSA member for the DSA office's own club.
create or replace function public.is_club_manager(p_club_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (public.has_role('organizer') and exists (
            select 1 from public.club_members m
            where m.club_id = p_club_id
              and m.user_id = auth.uid()
              and m.membership_status = 'active'
              and m.membership_role in ('lead', 'coordinator')))
      or (public.has_role('dsa') and exists (
            select 1 from public.clubs c where c.id = p_club_id and c.is_dsa_office))
$$;

-- Is the caller the configured DSA head (an active DSA account)?
create or replace function public.is_dsa_head()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.has_role('dsa') and exists (
    select 1 from public.profiles p
    join public.platform_settings s on s.key = 'dsa_head_email'
    where p.id = auth.uid()
      and lower(p.email) = lower(s.value #>> '{}'))
$$;

-- Who may take a proposal into review / decide it?
--   club events: any DSA member except the creator;
--   DSA-office events: the DSA head, or (only when the head created it)
--   another DSA member. Never the creator.
create or replace function public._can_review(p_event public.events)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.has_role('dsa')
     and p_event.created_by is distinct from auth.uid()
     and (
       not exists (select 1 from public.clubs c where c.id = p_event.club_id and c.is_dsa_office)
       or public.is_dsa_head()
       or exists (
         select 1 from public.profiles p
         join public.platform_settings s on s.key = 'dsa_head_email'
         where p.id = p_event.created_by and lower(p.email) = lower(s.value #>> '{}'))
     )
$$;

-- For the review desk: may I decide this proposal? (UI hint only; the
-- review functions enforce the same rule.)
create or replace function public.can_review_event(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select public._can_review(e) from public.events e where e.id = p_event_id), false)
$$;

-- Validation shared by submit and approve, now aware of venue requests.
-- On SUBMIT a request is acceptable (checked for capacity and dates);
-- on APPROVE review_event converts the request into a real venue first,
-- so the venue clash check below always runs before approval.
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
    if p_event.requested_venue_name is null then
      raise exception 'Choose a venue, or request another venue, before submitting.' using errcode = 'P0001';
    end if;
    if p_event.capacity > p_event.requested_venue_capacity then
      raise exception 'Capacity (%) is larger than the requested venue holds (%).', p_event.capacity, p_event.requested_venue_capacity using errcode = 'P0001';
    end if;
  else
    select * into v from public.venues where id = p_event.venue_id;
    if not found or not v.is_active then
      raise exception 'The chosen venue is not available.' using errcode = 'P0001';
    end if;
    if p_event.capacity > v.capacity then
      raise exception 'Capacity (%) is larger than % can hold (%).', p_event.capacity, v.name, v.capacity using errcode = 'P0001';
    end if;
  end if;
  if p_event.starts_at <= now() then
    raise exception 'The event must start in the future.' using errcode = 'P0001';
  end if;
  if p_event.registration_closes_at <= now() then
    raise exception 'The registration deadline has already passed. Move it later.' using errcode = 'P0001';
  end if;
  if p_event.venue_id is not null then
    clash := public._venue_clash(p_event);
    if clash is not null then
      raise exception '%', clash using errcode = '23P01';  -- 23P01 = exclusion_violation
    end if;
  end if;
end;
$$;

revoke execute on function public._can_review(public.events) from public, anon, authenticated;
revoke execute on function public.is_dsa_head() from public, anon;
revoke execute on function public.can_review_event(uuid) from public, anon;
grant  execute on function public.is_dsa_head() to authenticated;
grant  execute on function public.can_review_event(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Submission and review (same behaviour as migration 8, plus the
--    DSA-head rule and venue requests)
-- ---------------------------------------------------------------------
create or replace function public.submit_event(p_event_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.events := public._lock_event(p_event_id);
  stamp bigint := extract(epoch from clock_timestamp())::bigint;
  dsa_event boolean;
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
    raise exception 'That venue was just booked for an overlapping time. Choose another time or venue.' using errcode = '23P01';
  end;

  perform public.write_audit('event.submit', 'event', e.id,
    jsonb_build_object('from', e.status, 'venue_request', e.requested_venue_name));

  select c.is_dsa_office into dsa_event from public.clubs c where c.id = e.club_id;
  -- DSA events go to the head (plus anyone else who may review them);
  -- club events to every DSA member.
  perform public.notify(p.id, 'event_submitted',
                        case when dsa_event then 'New DSA event for approval' else 'New event proposal' end,
                        format('"%s" is waiting for review.', e.title), 'event', e.id,
                        format('event:%s:submitted:%s', e.id, stamp))
  from public.profiles p
  where p.role = 'dsa' and p.is_active and p.id <> e.created_by
    and (not dsa_event
         or lower(p.email) = lower((select s.value #>> '{}' from public.platform_settings s where s.key = 'dsa_head_email'))
         or e.created_by = (select h.id from public.profiles h
                            where lower(h.email) = lower((select s.value #>> '{}' from public.platform_settings s where s.key = 'dsa_head_email'))));
end;
$$;

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
  if not public._can_review(e) then
    raise exception 'Events hosted by the Office of the DSA are reviewed by the DSA head, and nobody reviews their own event.' using errcode = '42501';
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
  v_id uuid;
  v_added boolean := false;
begin
  if not public.has_role('dsa') then
    raise exception 'Only DSA reviewers can decide on proposals.' using errcode = '42501';
  end if;
  if e.created_by = auth.uid() then
    raise exception 'You cannot review a proposal you created.' using errcode = '42501';
  end if;
  if not public._can_review(e) then
    raise exception 'Events hosted by the Office of the DSA are approved by the DSA head.' using errcode = '42501';
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

  if new_status = 'approved' and e.venue_id is null and e.requested_venue_name is not null then
    -- Approving a venue request: reuse the listed venue with that name,
    -- or add the requested venue to the official list. Either way the
    -- event now holds a real venue and the clash rule applies.
    select id into v_id from public.venues where lower(name) = lower(trim(e.requested_venue_name));
    if v_id is null then
      insert into public.venues (name, building, capacity, description)
      values (trim(e.requested_venue_name), nullif(trim(coalesce(e.requested_venue_building, '')), ''),
              e.requested_venue_capacity, format('Added by the DSA when approving "%s".', e.title))
      returning id into v_id;
      v_added := true;
    end if;
    e.venue_id := v_id;
  end if;

  if new_status = 'approved' then
    -- Re-check at the moment of approval: venue, capacity, dates, clashes.
    perform public._assert_event_schedulable(e);
  end if;

  begin
    update public.events
       set status = new_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = note,
           venue_id = e.venue_id
     where id = e.id;
  exception when exclusion_violation then
    raise exception 'That venue was just booked for an overlapping time.' using errcode = '23P01';
  end;

  perform public.write_audit('event.' || p_decision, 'event', e.id,
    jsonb_build_object('from', e.status, 'to', new_status, 'note', note,
                       'venue_request', e.requested_venue_name,
                       'venue_added', case when v_added then v_id end));
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
-- 4. Event media in Supabase Storage
-- ---------------------------------------------------------------------
-- Public bucket: anyone can VIEW a file by its URL (like the event
-- images today). Uploads are limited by type and size at the bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Files live at '<event id>/<file>'. The caller may write there only if
-- they manage that event AND it is still editable (draft or changes
-- requested). Malformed paths are simply refused.
create or replace function public.can_edit_event_media(p_object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when split_part(p_object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then exists (
      select 1 from public.events e
      where e.id = split_part(p_object_name, '/', 1)::uuid
        and e.status in ('draft', 'changes_requested')
        and public.is_club_manager(e.club_id))
    else false
  end
$$;
revoke execute on function public.can_edit_event_media(text) from public, anon;
grant  execute on function public.can_edit_event_media(text) to authenticated;

drop policy if exists "event-media: managers upload" on storage.objects;
drop policy if exists "event-media: managers replace" on storage.objects;
drop policy if exists "event-media: managers delete" on storage.objects;

create policy "event-media: managers upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-media' and public.can_edit_event_media(name));
create policy "event-media: managers replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-media' and public.can_edit_event_media(name))
  with check (bucket_id = 'event-media' and public.can_edit_event_media(name));
create policy "event-media: managers delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-media' and public.can_edit_event_media(name));
