// Security audit as tests: if a future migration exposes something by
// accident, these fail. (Stage 10.)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.js';

let db;
before(async () => { db = await freshDb(); });
after(async () => { await db?.close(); });

const callable = async role => (await db.query(`
  select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
    and has_function_privilege($1, p.oid, 'EXECUTE')
  order by 1`, [role])).rows.map(r => r.proname);

test('visitors (anon) can call only the public seat counter', async () => {
  // time_range / time_multirange are PostgreSQL's automatic constructors
  // for our custom range type: pure, read nothing.
  assert.deepEqual(await callable('anon'), ['get_event_seats', 'time_multirange', 'time_range']);
});

test('logged-in users can call exactly the designed API (no internal helpers)', async () => {
  const fns = await callable('authenticated');
  assert.deepEqual(fns.filter(f => f.startsWith('_')), [], 'internal _helpers must stay private');
  for (const forbidden of ['write_audit', 'notify', 'handle_new_user', 'handle_user_email_change', 'recommended_events', 'enforce_event_transition']) {
    assert.ok(!fns.includes(forbidden), `${forbidden} must not be callable`);
  }
  assert.deepEqual(fns, [
    'admin_dashboard', 'admin_set_user_active', 'admin_set_user_role', 'can_edit_event_media', 'can_review_event', 'can_review_od',
    'cancel_event', 'cancel_registration',
    'check_in', 'check_timetable_conflict', 'close_attendance_session', 'complete_event', 'current_app_role', 'decide_od',
    'dsa_dashboard', 'event_scheduling_warnings', 'get_event_attendance', 'get_event_registrants', 'get_event_seats',
    'get_od_queue', 'get_recommendations', 'has_role', 'is_club_manager', 'is_dsa_head', 'manages_event', 'mark_attendance_manual',
    'my_attendance', 'my_od_requests', 'open_attendance_session', 'organizer_dashboard', 'publish_event',
    'register_for_event', 'reopen_event', 'request_od', 'review_event', 'revoke_attendance', 'start_event_review',
    'student_dashboard', 'submit_event', 'time_multirange', 'time_range', 'withdraw_od',
  ], 'a new function was exposed: review it, then update this list on purpose');
});

test('every SECURITY DEFINER function pins its search_path', async () => {
  const { rows } = await db.query(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
  assert.deepEqual(rows, []);
});

test('visitors hold no write privilege on any table', async () => {
  const { rows } = await db.query(`
    select c.relname, p.priv from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p(priv)
    where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, p.priv)`);
  assert.deepEqual(rows, []);
});

test('no table in public is missing row level security', async () => {
  const { rows } = await db.query(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  assert.deepEqual(rows, []);
});
