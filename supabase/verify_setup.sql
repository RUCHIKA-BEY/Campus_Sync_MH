-- =====================================================================
-- CampusSync — setup checklist. Read-only: changes nothing.
-- Paste into Supabase → SQL Editor → Run. Every row should say ✅.
-- =====================================================================
with checks(check_name, expected, actual) as (
  values
  ('btree_gist extension installed', '1',
     (select count(*)::text from pg_extension where extname = 'btree_gist')),
  ('public tables', '21',
     (select count(*)::text from pg_tables where schemaname = 'public')),
  ('tables WITHOUT row level security (must be 0)', '0',
     (select count(*)::text from pg_tables t join pg_class c on c.relname = t.tablename
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where t.schemaname = 'public' and not c.relrowsecurity)),
  ('tables with NO policy (must be 0)', '0',
     (select count(*)::text from pg_tables t where t.schemaname = 'public'
        and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename))),
  ('RLS policies', '75',
     (select count(*)::text from pg_policies where schemaname = 'public')),
  ('signup trigger on auth.users', '1',
     (select count(*)::text from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal)),
  ('email-sync trigger on auth.users', '1',
     (select count(*)::text from pg_trigger where tgname = 'on_auth_user_email_changed' and not tgisinternal)),
  ('venue double-booking constraint', '1',
     (select count(*)::text from pg_constraint where conname = 'events_no_venue_double_booking')),
  ('SECURITY DEFINER functions without pinned search_path (must be 0)', '0',
     (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'))),
  ('browser role can UPDATE profiles.role (must be false)', 'false',
     (select has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')::text)),
  ('browser role can UPDATE events.status (must be false)', 'false',
     (select has_column_privilege('authenticated', 'public.events', 'status', 'UPDATE')::text)),
  ('categories (reference data)', '8',  (select count(*)::text from public.categories)),
  ('platform settings',           '6',  (select count(*)::text from public.platform_settings)),
  ('departments (seed)',          '7',  (select count(*)::text from public.departments)),
  ('venues (seed)',               '5',  (select count(*)::text from public.venues)),
  ('clubs (seed)',                '6',  (select count(*)::text from public.clubs)),
  ('academic terms (seed)',       '2',  (select count(*)::text from public.academic_terms))
)
select case when expected = actual then '✅' else '❌' end as ok,
       check_name, expected, actual
from checks;
