-- =====================================================================
-- CampusSync — setup checklist. Read-only: changes nothing.
-- Paste into Supabase → SQL Editor → Run. Every row should say ✅.
--
-- Rows marked [m7] need migration 20261124000100 (explicit grants);
-- rows marked [m8] need 20261124000200 (event lifecycle, Stage 5);
-- rows marked [m9] need 20261124000300 (registration & conflicts, Stage 6).
-- The last two rows read the Supabase CLI's migration history table
-- (supabase_migrations.schema_migrations); before you run
-- `supabase migration repair` they show "no history table yet".
-- =====================================================================
with history as (
  select case
           when to_regclass('supabase_migrations.schema_migrations') is null then null
           -- query_to_xml runs the query dynamically, so this file still
           -- works on a project where the history table doesn't exist yet.
           else (xpath('/row/n/text()', query_to_xml(
                  'select count(*) as n from supabase_migrations.schema_migrations', false, true, '')))[1]::text
         end as applied_count,
         case
           when to_regclass('supabase_migrations.schema_migrations') is null then null
           else (xpath('/row/v/text()', query_to_xml(
                  'select max(version) as v from supabase_migrations.schema_migrations', false, true, '')))[1]::text
         end as latest_version
),
checks(check_name, expected, actual, passed) as (
  values
  ('btree_gist extension installed', '1',
     (select count(*)::text from pg_extension where extname = 'btree_gist'), null::boolean),
  ('public tables', '21',
     (select count(*)::text from pg_tables where schemaname = 'public'), null),
  ('tables WITHOUT row level security', '0',
     (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), null),
  ('tables with NO policy', '0',
     (select count(*)::text from pg_tables t where t.schemaname = 'public'
        and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)), null),
  ('RLS policies', '75',
     (select count(*)::text from pg_policies where schemaname = 'public'), null),
  ('signup trigger on auth.users', '1',
     (select count(*)::text from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal), null),
  ('email-sync trigger on auth.users', '1',
     (select count(*)::text from pg_trigger where tgname = 'on_auth_user_email_changed' and not tgisinternal), null),
  ('venue double-booking constraint', '1',
     (select count(*)::text from pg_constraint where conname = 'events_no_venue_double_booking'), null),
  ('SECURITY DEFINER functions without pinned search_path', '0',
     (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), null),
  ('browser role can UPDATE profiles.role', 'false',
     (select has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')::text), null),
  ('browser role can UPDATE events.status', 'false',
     (select has_column_privilege('authenticated', 'public.events', 'status', 'UPDATE')::text), null),
  ('[m7] visitors can read categories', 'true',
     (select has_table_privilege('anon', 'public.categories', 'SELECT')::text), null),
  ('[m7] visitors can read profiles', 'false',
     (select has_table_privilege('anon', 'public.profiles', 'SELECT')::text), null),
  ('[m7] logged-in users can read their registrations', 'true',
     (select has_table_privilege('authenticated', 'public.event_registrations', 'SELECT')::text), null),
  ('[m7] logged-in users can INSERT registrations directly', 'false',
     (select has_table_privilege('authenticated', 'public.event_registrations', 'INSERT')::text), null),
  ('[m7] tables the server role cannot read', '0',
     (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not has_table_privilege('service_role', c.oid, 'SELECT')), null),
  ('[m8] event status-transition trigger', '1',
     (select count(*)::text from pg_trigger where tgname = 'events_enforce_transition' and not tgisinternal), null),
  ('[m8] lifecycle functions callable by logged-in users', '7',
     (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('submit_event','reopen_event','start_event_review','review_event','publish_event','complete_event','cancel_event')
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')), null),
  ('[m8] internal helpers callable by logged-in users', '0',
     (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like '\_%'
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')), null),
  ('[m9] registration & scheduling functions for logged-in users', '5',
     (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('check_timetable_conflict','register_for_event','cancel_registration','event_scheduling_warnings','get_event_registrants')
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')), null),
  ('[m9] visitors can read seat counts (numbers only)', 'true',
     (select coalesce(bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')), false)::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_event_seats'), null),
  ('categories (migration data)', '8',  (select count(*)::text from public.categories), null),
  ('platform settings (migration data)', '6', (select count(*)::text from public.platform_settings), null),
  ('departments (seed, at least 1)', '≥ 1', (select count(*)::text from public.departments),
     (select count(*) > 0 from public.departments)),
  ('venues (seed, at least 1)', '≥ 1', (select count(*)::text from public.venues),
     (select count(*) > 0 from public.venues)),
  ('clubs (seed, at least 1)', '≥ 1', (select count(*)::text from public.clubs),
     (select count(*) > 0 from public.clubs)),
  ('academic terms (seed, at least 1)', '≥ 1', (select count(*)::text from public.academic_terms),
     (select count(*) > 0 from public.academic_terms)),
  ('migration history: versions recorded', '9',
     coalesce((select applied_count from history), 'no history table yet'), null),
  ('migration history: latest version', '20261124000300',
     coalesce((select latest_version from history), 'no history table yet'), null)
)
select case when coalesce(passed, expected = actual) then '✅' else '❌' end as ok,
       check_name, expected, actual
from checks;
