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
-- Since 30 Oct 2026 Supabase NO LONGER auto-grants table privileges in
-- `public` to anon/authenticated/service_role ("Automatically expose new
-- tables" is off). The shim mirrors that: tables get NO default grants,
-- so every grant the app needs must be written explicitly in a migration
-- (see migration 20261124000100). Functions still default to EXECUTE for
-- PUBLIC, as in PostgreSQL itself.

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

-- Minimal Supabase Storage: buckets + objects with RLS, and the
-- storage.foldername() helper. (Size and file-type limits are enforced by
-- the Storage API in a real project, not by these tables.)
create schema if not exists storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null unique,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to anon, authenticated;
