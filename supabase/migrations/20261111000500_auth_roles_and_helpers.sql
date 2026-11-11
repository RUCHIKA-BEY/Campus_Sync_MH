-- =====================================================================
-- CampusSync migration 5 — authentication, roles, helper functions
-- ---------------------------------------------------------------------
-- Explained in docs/AUTHENTICATION.md and docs/SECURITY.md.
--
-- SECURITY DEFINER, in one paragraph:
--   A normal function runs with the CALLER's permissions. A SECURITY
--   DEFINER function runs with its OWNER's permissions, like a staff-
--   only door that a guard opens for you after checking your ID. We use
--   it only where it's genuinely needed, and every such function:
--     * sets search_path = '' and fully qualifies every name, so nobody
--       can plant a fake "profiles" table earlier on the search path;
--     * checks who the caller is (auth.uid()) before doing anything;
--     * has EXECUTE revoked from roles that shouldn't call it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Role helper functions (used inside RLS policies)
-- ---------------------------------------------------------------------
-- Why SECURITY DEFINER here: a policy ON profiles that reads profiles
-- would trigger the same policy again (infinite recursion). The helper
-- reads profiles as the table owner, which bypasses RLS, and it only
-- ever returns facts about the CALLER, so nothing leaks.

-- The caller's role, or NULL if not logged in / deactivated.
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;

-- true if the caller is active and has one of the given roles.
create or replace function public.has_role(variadic roles public.app_role[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = any (roles), false)
$$;

-- Organizer scope (decision D4): the caller must hold the global
-- 'organizer' role AND be an active lead/coordinator of the club.
create or replace function public.is_club_manager(p_club_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.has_role('organizer') and exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id
      and m.user_id = auth.uid()
      and m.membership_status = 'active'
      and m.membership_role in ('lead', 'coordinator')
  )
$$;

-- Does the caller manage the club that owns this event?
create or replace function public.manages_event(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and public.is_club_manager(e.club_id)
  )
$$;

-- May the caller decide OD requests? Configurable (decision D5):
-- platform_settings.od_reviewer_roles, default ["dsa"].
create or replace function public.can_review_od()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    public.current_app_role()::text in (
      select jsonb_array_elements_text(s.value)
      from public.platform_settings s where s.key = 'od_reviewer_roles'
    ), false)
$$;

revoke execute on function public.current_app_role()        from public, anon;
revoke execute on function public.has_role(public.app_role[]) from public, anon;
revoke execute on function public.is_club_manager(uuid)     from public, anon;
revoke execute on function public.manages_event(uuid)       from public, anon;
revoke execute on function public.can_review_od()           from public, anon;
grant  execute on function public.current_app_role()        to authenticated;
grant  execute on function public.has_role(public.app_role[]) to authenticated;
grant  execute on function public.is_club_manager(uuid)     to authenticated;
grant  execute on function public.manages_event(uuid)       to authenticated;
grant  execute on function public.can_review_od()           to authenticated;

-- ---------------------------------------------------------------------
-- 2. Internal helpers: audit log + notifications
-- ---------------------------------------------------------------------
-- Browser roles cannot call these directly (EXECUTE revoked); only the
-- trusted SECURITY DEFINER workflow functions use them.
create or replace function public.write_audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
$$;

create or replace function public.notify(
  p_recipient uuid, p_type text, p_title text, p_message text,
  p_entity_type text, p_entity_id uuid, p_dedupe_key text)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.notifications
    (recipient_id, type, title, message, related_entity_type, related_entity_id, dedupe_key)
  values (p_recipient, p_type, p_title, p_message, p_entity_type, p_entity_id, p_dedupe_key)
  on conflict on constraint notifications_dedupe do nothing
$$;

revoke execute on function public.write_audit(text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.notify(uuid, text, text, text, text, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Profile creation on signup
-- ---------------------------------------------------------------------
-- When Supabase Auth creates a row in auth.users (someone signed up),
-- this trigger creates the matching profiles row in the SAME
-- transaction: either both rows exist or neither does.
--
-- The role is NEVER read from signup data. A user who adds
-- {"role": "admin"} to their signup request still becomes a student.
-- Other metadata is treated as untrusted input and sanitised; a bad
-- value becomes NULL rather than blocking signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name    text  := left(trim(coalesce(meta ->> 'full_name', '')), 100);
  v_regno   text  := upper(trim(coalesce(meta ->> 'registration_number', '')));
  v_dept    uuid;
  v_year    smallint;
begin
  if length(v_name) < 2 then
    v_name := split_part(new.email, '@', 1);            -- fallback: email prefix
  end if;

  if v_regno !~ '^[A-Z0-9]{4,20}$'
     or exists (select 1 from public.profiles p where upper(p.registration_number) = v_regno) then
    v_regno := null;                                    -- invalid or already claimed
  end if;

  select d.id into v_dept from public.departments d
  where d.code = upper(meta ->> 'department_code');

  if (meta ->> 'academic_year') ~ '^[1-5]$' then
    v_year := (meta ->> 'academic_year')::smallint;
  end if;

  insert into public.profiles (id, full_name, email, registration_number, department_id, academic_year)
  values (new.id, v_name, coalesce(new.email, new.id::text || '@no-email.invalid'),
          v_regno, v_dept, v_year);
  -- role is omitted on purpose: the column default ('student') applies.
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in step when a user changes their login email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------
-- 4. Column-level protection on profiles
-- ---------------------------------------------------------------------
-- RLS decides WHICH ROWS a user may touch; column privileges decide
-- WHICH COLUMNS. Browser users may edit only these personal fields.
-- role, is_active, email and id are therefore impossible to change from
-- the browser, whatever request is sent.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, registration_number, department_id, academic_year,
              semester, phone_number, avatar_url)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 5. Admin-only role and activation management
-- ---------------------------------------------------------------------
create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old public.app_role;
begin
  if not public.has_role('admin') then
    raise exception 'Only administrators can change roles' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    -- Stops an admin locking everyone out by demoting themselves.
    raise exception 'Administrators cannot change their own role' using errcode = '42501';
  end if;

  select role into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if v_old = p_role then
    return;
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  perform public.write_audit('role.change', 'profile', p_user_id,
    jsonb_build_object('old_role', v_old, 'new_role', p_role));
  perform public.notify(p_user_id, 'role_changed', 'Your access has changed',
    format('Your CampusSync role is now %s.', p_role), 'profile', p_user_id,
    format('role:%s:%s', p_role, extract(epoch from now())::bigint));
end;
$$;

create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.has_role('admin') then
    raise exception 'Only administrators can activate or deactivate users' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Administrators cannot deactivate themselves' using errcode = '42501';
  end if;
  update public.profiles set is_active = p_active where id = p_user_id;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  perform public.write_audit(case when p_active then 'user.activate' else 'user.deactivate' end,
    'profile', p_user_id, '{}'::jsonb);
end;
$$;

revoke execute on function public.admin_set_user_role(uuid, public.app_role) from public, anon;
revoke execute on function public.admin_set_user_active(uuid, boolean)       from public, anon;
grant  execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;
grant  execute on function public.admin_set_user_active(uuid, boolean)       to authenticated;
