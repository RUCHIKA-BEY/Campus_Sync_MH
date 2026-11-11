-- TEST-ONLY stand-in for objects that Supabase creates in every real
-- project. Our migrations reference them, so a plain PostgreSQL (PGlite)
-- needs them before the migrations can run. NEVER apply this file to a
-- real Supabase project: those objects already exist there.

create schema if not exists extensions;
create schema if not exists auth;

-- The API roles Supabase uses for browser requests.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin;          end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Minimal auth.users: only the columns our code touches.
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Supabase's auth.uid(): the user id from the request's JWT.
-- Tests simulate a logged-in user with:
--   select set_config('request.jwt.claim.sub', '<uuid>', true);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
