// Stage 3 schema tests: prove the database itself enforces the rules
// in docs/SCHEMA_PROPOSAL.md, independent of any frontend code.
// Run with:  npm run test:db
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, isolated, expectFail, expectFailFn, one, makeUser, makeEvent, refIds } from './harness.js';

let db, ids;
before(async () => { db = await freshDb(); ids = await refIds(db); });
after(async () => { await db?.close(); });

const SUBMITTED = { status: 'submitted', submitted_at: '2026-11-11 10:00+05:30' };

// ---------------------------------------------------------------- setup
test('migrations + seed apply cleanly and load reference data', async () => {
  const counts = await one(db, `select
    (select count(*) from public.categories)::int  as categories,
    (select count(*) from public.departments)::int as departments,
    (select count(*) from public.venues)::int      as venues,
    (select count(*) from public.clubs)::int       as clubs,
    (select count(*) from public.academic_terms)::int as terms,
    (select count(*) from public.platform_settings)::int as settings`);
  assert.deepEqual(counts, { categories: 8, departments: 7, venues: 5, clubs: 6, terms: 2, settings: 6 });
  const orphanClubs = await one(db, `select count(*)::int n from public.clubs where category_id is null`);
  assert.equal(orphanClubs.n, 0, 'every seeded club resolved its category');
});

test('seed.sql is re-runnable (idempotent)', async () => {
  const { readFileSync } = await import('node:fs');
  await db.exec(readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8'));
  assert.equal((await one(db, 'select count(*)::int n from public.venues')).n, 5);
});

test('RLS is enabled on every public table (deny-by-default)', async () => {
  const { rows } = await db.query(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  assert.deepEqual(rows, [], `Tables without RLS: ${rows.map(r => r.relname).join(', ')}`);
});

test('RLS with no policies: a logged-in user sees nothing and cannot write', async () => {
  await isolated(db, async () => {
    const student = await makeUser(db, 'student');
    await db.exec(`set local role authenticated`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [student]);
    assert.equal((await one(db, 'select count(*)::int n from public.venues')).n, 0);
    assert.equal((await one(db, 'select count(*)::int n from public.profiles')).n, 0);
    // INSERT with no INSERT policy raises an RLS error:
    await expectFail(db, `insert into public.venues (name, capacity) values ('Hacked Hall', 10)`, [], 'row-level security');
    // UPDATE with no policy matches zero rows (the rows are invisible),
    // so the attempted self-promotion to admin changes nothing:
    const upd = await db.query(`update public.profiles set role = 'admin' where id = $1 returning id`, [student]);
    assert.equal(upd.rows.length, 0);
    await db.exec('reset role');
    assert.equal((await one(db, 'select role from public.profiles where id = $1', [student])).role, 'student');
  });
});

// ------------------------------------------------------------- profiles
test('profiles: default role is student; email & reg. number unique case-insensitively', async () => {
  await isolated(db, async () => {
    const { id } = await one(db, `insert into auth.users (email) values ('a@x.dev') returning id`);
    await db.query(`insert into public.profiles (id, full_name, email, registration_number) values ($1,'Asha K','A@X.dev','22cs0001')`, [id]);
    assert.equal((await one(db, 'select role from public.profiles where id=$1', [id])).role, 'student');
    const { id: id2 } = await one(db, `insert into auth.users (email) values ('a2@x.dev') returning id`);
    await expectFail(db, `insert into public.profiles (id, full_name, email) values ($1,'Dup','a@x.DEV')`, [id2], 'profiles_email_unique');
    await expectFail(db, `insert into public.profiles (id, full_name, email, registration_number) values ($1,'Dup','b@x.dev','22CS0001')`, [id2], 'profiles_registration_number_unique');
    await expectFail(db, `insert into public.profiles (id, full_name, email, role) values ($1,'Bad','c@x.dev','superadmin')`, [id2], 'invalid input value for enum');
  });
});

test('profiles: deleting the auth user cascades to the profile', async () => {
  await isolated(db, async () => {
    const u = await makeUser(db);
    await db.query('delete from auth.users where id = $1', [u]);
    assert.equal((await one(db, 'select count(*)::int n from public.profiles where id=$1', [u])).n, 0);
  });
});

test('updated_at is stamped by the database on update', async () => {
  await isolated(db, async () => {
    const u = await makeUser(db);
    await db.query(`update public.profiles set updated_at = '2000-01-01' where id = $1`, [u]);
    const row = await one(db, 'select updated_at from public.profiles where id=$1', [u]);
    assert.ok(row.updated_at.getFullYear() > 2000, 'client-supplied updated_at was overwritten');
  });
});

// --------------------------------------------------------------- events
test('events: time order, registration window, capacity', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    await expectFailFn(db, () => makeEvent(db, ids, org, { ends_at: '2026-12-01 09:00+05:30' }), 'events_time_order');
    await expectFailFn(db, () => makeEvent(db, ids, org, { registration_closes_at: '2026-12-01 11:00+05:30' }), 'events_registration_window');
    await expectFailFn(db, () => makeEvent(db, ids, org, { capacity: 0 }), 'capacity_check');
  });
});

test('events: only drafts may omit a venue', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    await makeEvent(db, ids, org, { venue_id: null });               // draft: ok
    await expectFailFn(db, () => makeEvent(db, ids, org, { venue_id: null, ...SUBMITTED }), 'events_venue_required');
  });
});

test('events: no self-approval; rejection needs a reason', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    const dsa = await makeUser(db, 'dsa');
    const ev = await makeEvent(db, ids, org, SUBMITTED);
    await expectFail(db, `update public.events set status='approved', reviewed_by=$1, reviewed_at=now() where id=$2`, [org, ev], 'events_no_self_review');
    await expectFail(db, `update public.events set status='approved' where id=$1`, [ev], 'events_review_recorded');
    await expectFail(db, `update public.events set status='rejected', reviewed_by=$1, reviewed_at=now() where id=$2`, [dsa, ev], 'events_review_note_required');
    await db.query(`update public.events set status='rejected', reviewed_by=$1, reviewed_at=now(), review_note='Venue too small for expected turnout.' where id=$2`, [dsa, ev]);
  });
});

test('events: cancellation needs a reason; publishing records published_at', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    const ev = await makeEvent(db, ids, org);
    await expectFail(db, `update public.events set status='cancelled', cancelled_at=now() where id=$1`, [ev], 'events_cancellation_reason_required');
    await expectFail(db, `update public.events set status='published', submitted_at=now() where id=$1`, [ev], 'events_published_recorded');
  });
});

// ------------------------------------------------- venue double booking
test('venue: overlapping reserving events at the same venue are rejected', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    await makeEvent(db, ids, org, SUBMITTED); // 10:00–12:00
    await expectFailFn(db, () => makeEvent(db, ids, org, { ...SUBMITTED, starts_at: '2026-12-01 11:00+05:30', ends_at: '2026-12-01 13:00+05:30' }), 'events_no_venue_double_booking');
    // fully inside
    await expectFailFn(db, () => makeEvent(db, ids, org, { ...SUBMITTED, starts_at: '2026-12-01 10:30+05:30', ends_at: '2026-12-01 11:00+05:30' }), 'events_no_venue_double_booking');
  });
});

test('venue: adjacent bookings (12:00 end / 12:00 start) are allowed', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    await makeEvent(db, ids, org, SUBMITTED);
    await makeEvent(db, ids, org, { ...SUBMITTED, starts_at: '2026-12-01 12:00+05:30', ends_at: '2026-12-01 14:00+05:30' });
  });
});

test('venue: same time at a different venue is allowed', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    await makeEvent(db, ids, org, SUBMITTED);
    await makeEvent(db, ids, org, { ...SUBMITTED, venue_id: ids.venue2 });
  });
});

test('venue: same instant expressed in another timezone still collides', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    await makeEvent(db, ids, org, SUBMITTED); // 10:00–12:00 IST = 04:30–06:30 UTC
    await expectFailFn(db, () => makeEvent(db, ids, org, { ...SUBMITTED, starts_at: '2026-12-01 05:00Z', ends_at: '2026-12-01 05:30Z' }), 'events_no_venue_double_booking');
  });
});

test('venue: drafts do not hold the venue; cancelling releases it', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    await makeEvent(db, ids, org);                 // draft
    const first = await makeEvent(db, ids, org, SUBMITTED); // overlaps the draft: fine
    await expectFailFn(db, () => makeEvent(db, ids, org, SUBMITTED), 'events_no_venue_double_booking');
    await db.query(`update public.events set status='cancelled', cancelled_at=now(), cancellation_reason='Speaker unavailable, rescheduling.' where id=$1`, [first]);
    await makeEvent(db, ids, org, SUBMITTED);      // slot free again
  });
});

// -------------------------------------------------------- registrations
async function registration(db, ev, student, extra = '') {
  return (await one(db, `insert into public.event_registrations (event_id, student_id, conflict_status ${extra ? ', status, cancelled_at' : ''})
    values ($1, $2, 'no_conflict' ${extra}) returning id, pass_code`, [ev, student])).id;
}

test('registrations: one active registration per student per event; re-register after cancel', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    const s = await makeUser(db);
    const ev = await makeEvent(db, ids, org, SUBMITTED);
    const r1 = await registration(db, ev, s);
    await expectFail(db, `insert into public.event_registrations (event_id, student_id, conflict_status) values ($1,$2,'no_conflict')`, [ev, s], 'event_registrations_one_active');
    await db.query(`update public.event_registrations set status='cancelled', cancelled_at=now() where id=$1`, [r1]);
    await registration(db, ev, s); // allowed again
    assert.equal((await one(db, 'select count(*)::int n from public.event_registrations where event_id=$1', [ev])).n, 2, 'history kept');
  });
});

test('registrations: pass_code is generated, 32 hex chars, unique', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    const ev = await makeEvent(db, ids, org, SUBMITTED);
    const a = await one(db, `insert into public.event_registrations (event_id, student_id, conflict_status) values ($1,$2,'no_conflict') returning pass_code`, [ev, await makeUser(db)]);
    const b = await one(db, `insert into public.event_registrations (event_id, student_id, conflict_status) values ($1,$2,'no_conflict') returning pass_code`, [ev, await makeUser(db)]);
    assert.match(a.pass_code, /^[0-9a-f]{32}$/);
    assert.notEqual(a.pass_code, b.pass_code);
  });
});

test('registrations: status and cancelled_at must agree', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    const ev = await makeEvent(db, ids, org, SUBMITTED);
    const r = await registration(db, ev, await makeUser(db));
    await expectFail(db, `update public.event_registrations set status='cancelled' where id=$1`, [r], 'event_registrations_cancel_recorded');
  });
});

// ----------------------------------------------------------- OD requests
test('OD: student/event must match the registration (composite FK)', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    const s1 = await makeUser(db), s2 = await makeUser(db);
    const ev = await makeEvent(db, ids, org, SUBMITTED);
    const r = await registration(db, ev, s1);
    await expectFail(db, `insert into public.od_requests (registration_id, student_id, event_id, reason) values ($1,$2,$3,'Clashes with my lab session')`, [r, s2, ev], 'od_requests_registration_fkey');
  });
});

test('OD: one active request per registration; a new one allowed after rejection', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer'), dsa = await makeUser(db, 'dsa');
    const s = await makeUser(db);
    const ev = await makeEvent(db, ids, org, SUBMITTED);
    const r = await registration(db, ev, s);
    const ins = `insert into public.od_requests (registration_id, student_id, event_id, reason) values ($1,$2,$3,'Clashes with my lab session') returning id`;
    const od = (await one(db, ins, [r, s, ev])).id;
    await expectFail(db, ins, [r, s, ev], 'od_requests_one_active');
    await expectFail(db, `update public.od_requests set status='rejected', reviewed_by=$1, reviewed_at=now() where id=$2`, [dsa, od], 'od_requests_rejection_note_required');
    await db.query(`update public.od_requests set status='rejected', reviewed_by=$1, reviewed_at=now(), review_note='Please attach faculty consent.' where id=$2`, [dsa, od]);
    await one(db, ins, [r, s, ev]); // resubmission allowed
  });
});

test('OD: approval does not create attendance', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer'), dsa = await makeUser(db, 'dsa');
    const s = await makeUser(db);
    const ev = await makeEvent(db, ids, org, SUBMITTED);
    const r = await registration(db, ev, s);
    await db.query(`insert into public.od_requests (registration_id, student_id, event_id, reason, status, reviewed_by, reviewed_at) values ($1,$2,$3,'Clashes with my lab session','approved',$4,now())`, [r, s, ev, dsa]);
    assert.equal((await one(db, 'select count(*)::int n from public.attendance_records where registration_id=$1', [r])).n, 0);
  });
});

// ------------------------------------------------------------ attendance
test('attendance: no duplicates; QR needs a session of the SAME event', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    const s = await makeUser(db);
    const ev = await makeEvent(db, ids, org, SUBMITTED);
    const ev2 = await makeEvent(db, ids, org, { ...SUBMITTED, venue_id: ids.venue2 });
    const r = await registration(db, ev, s);
    const sessOther = (await one(db, `insert into public.attendance_sessions (event_id, opened_by, closes_at) values ($1,$2, now() + interval '1 hour') returning id`, [ev2, org])).id;
    const sess = (await one(db, `insert into public.attendance_sessions (event_id, opened_by, closes_at) values ($1,$2, now() + interval '1 hour') returning id`, [ev, org])).id;
    const ins = `insert into public.attendance_records (registration_id, event_id, student_id, session_id, method, recorded_by) values ($1,$2,$3,$4,$5,$6)`;
    await expectFail(db, ins, [r, ev, s, null, 'qr', org], 'attendance_records_qr_needs_session');
    await expectFail(db, ins, [r, ev, s, sessOther, 'qr', org], 'attendance_records_session_fkey');
    await db.query(ins, [r, ev, s, sess, 'qr', org]);
    await expectFail(db, ins, [r, ev, s, null, 'manual', org], 'attendance_records');
  });
});

test('attendance: cannot check in without a registration for that event', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    const s = await makeUser(db);
    const ev = await makeEvent(db, ids, org, SUBMITTED);
    const ev2 = await makeEvent(db, ids, org, { ...SUBMITTED, venue_id: ids.venue2 });
    const r2 = await registration(db, ev2, s); // registered for ev2 only
    await expectFail(db, `insert into public.attendance_records (registration_id, event_id, student_id, method, recorded_by) values ($1,$2,$3,'manual',$4)`, [r2, ev, s, org], 'attendance_records_registration_fkey');
  });
});

test('feedback: only allowed after attendance; one per student', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    const s = await makeUser(db);
    const ev = await makeEvent(db, ids, org, SUBMITTED);
    const ins = `insert into public.event_feedback (event_id, student_id, rating) values ($1,$2,5)`;
    await expectFail(db, ins, [ev, s], 'event_feedback_requires_attendance');
    const r = await registration(db, ev, s);
    await db.query(`insert into public.attendance_records (registration_id, event_id, student_id, method, recorded_by) values ($1,$2,$3,'manual',$4)`, [r, ev, s, org]);
    await db.query(ins, [ev, s]);
    await expectFail(db, ins, [ev, s], 'event_feedback_one_per_student');
  });
});

// ------------------------------------------------------------- timetable
test('timetable: overlapping classes rejected, adjacent allowed, end > start', async () => {
  await isolated(db, async () => {
    const s = await makeUser(db);
    const ins = `insert into public.timetable_slots (student_id, term_id, subject_name, day_of_week, start_time, end_time) values ($1,$2,$3,$4,$5,$6)`;
    await db.query(ins, [s, ids.term, 'Data Structures', 1, '09:00', '11:00']);
    await db.query(ins, [s, ids.term, 'Operating Systems', 1, '11:00', '12:30']);              // adjacent
    await expectFail(db, ins, [s, ids.term, 'Networks', 1, '10:30', '11:30'], 'timetable_slots_no_overlap');
    await db.query(ins, [s, ids.term, 'Networks', 2, '10:30', '11:30']);                      // other day
    await db.query(ins, [await makeUser(db), ids.term, 'Networks', 1, '10:30', '11:30']);     // other student
    await expectFail(db, ins, [s, ids.term, 'Backwards', 3, '11:00', '10:00'], 'timetable_slots_time_order');
    await expectFail(db, ins, [s, ids.term, 'Bad day', 8, '09:00', '10:00'], 'day_of_week_check');
  });
});

test('academic terms may not overlap', async () => {
  await isolated(db, async () => {
    await expectFail(db, `insert into public.academic_terms (name, starts_on, ends_on) values ('Clash', '2026-12-01', '2027-01-10')`, [], 'academic_terms_no_overlap');
  });
});

// --------------------------------------------------------------- system
test('notifications: dedupe_key prevents duplicates for the same recipient', async () => {
  await isolated(db, async () => {
    const u = await makeUser(db);
    const ins = `insert into public.notifications (recipient_id, type, title, message, dedupe_key) values ($1,'registration_confirmed','You are in','See you there','reg:abc') on conflict on constraint notifications_dedupe do nothing`;
    await db.query(ins, [u]);
    await db.query(ins, [u]);
    assert.equal((await one(db, 'select count(*)::int n from public.notifications where recipient_id=$1', [u])).n, 1);
  });
});

test('audit_logs: append-only (UPDATE, DELETE and TRUNCATE blocked even for the owner)', async () => {
  await isolated(db, async () => {
    const u = await makeUser(db, 'admin');
    const { id } = await one(db, `insert into public.audit_logs (actor_id, action, entity_type, entity_id) values ($1,'role.change','profile',$1) returning id`, [u]);
    await expectFail(db, `update public.audit_logs set action='role.hidden' where id=$1`, [id], 'append-only');
    await expectFail(db, `delete from public.audit_logs where id=$1`, [id], 'append-only');
    await expectFail(db, `truncate public.audit_logs`, [], 'append-only');
  });
});

test('browser roles have no UPDATE/DELETE grant on audit_logs', async () => {
  const { rows } = await db.query(`
    select grantee, privilege_type from information_schema.role_table_grants
    where table_schema='public' and table_name='audit_logs'
      and grantee in ('anon','authenticated') and privilege_type in ('UPDATE','DELETE','TRUNCATE')`);
  assert.deepEqual(rows, []);
});
