// Stage 6 tests: timetable conflict detection, transaction-safe
// registration, seat counts, campus-wide warnings, registrant lists.
//
// Fixed dates in a TEST term (2030) that each test creates inside its
// rolled-back transaction, so results never depend on today's semester.
// 2030-03-04 is a Monday (ISO day 1).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, isolated, expectFail, one, makeUser, makeEvent, makeClubLead, refIds, asUser } from './harness.js';

let db, ids;
before(async () => { db = await freshDb(); ids = await refIds(db); });
after(async () => { await db?.close(); });

const MON = '2030-03-04', TUE = '2030-03-05';
const at = (date, time) => `${date}T${time}:00+05:30`;
const iso = ms => new Date(Date.now() + ms).toISOString();

async function setup() {
  const term = (await one(db, `insert into public.academic_terms (name, starts_on, ends_on) values ('2030 Test Term', '2030-01-01', '2030-06-30') returning id`)).id;
  const org = await makeUser(db, 'organizer');
  await makeClubLead(db, org, ids.club);
  const dsa = await makeUser(db, 'dsa');
  return { term, org, dsa };
}

/** A PUBLISHED event (set up directly by the owner), registration open now. */
async function published(ctx, start, end, extra = {}) {
  return makeEvent(db, ids, ctx.org, {
    starts_at: start, ends_at: end, registration_opens_at: iso(-86400e3), registration_closes_at: start,
    status: 'published', submitted_at: iso(-3 * 86400e3), reviewed_by: ctx.dsa, reviewed_at: iso(-2 * 86400e3), published_at: iso(-86400e3),
    venue_id: null, capacity: 100, ...extra,
  });
}
// Published events need a venue (constraint); give each one its own slot in a big venue.
let venueNo = 0;
async function venue() {
  venueNo += 1;
  return (await one(db, `insert into public.venues (name, capacity) values ($1, 1000) returning id`, [`Test Venue ${venueNo}`])).id;
}
async function slot(student, term, day, start, end, subject = 'Data Structures') {
  await db.query(`insert into public.timetable_slots (student_id, term_id, subject_name, day_of_week, start_time, end_time) values ($1,$2,$3,$4,$5,$6)`,
    [student, term, subject, day, start, end]);
}
async function check(student, eventId) {
  return asUser(db, student, async () => (await one(db, 'select public.check_timetable_conflict($1) as r', [eventId])).r);
}
async function ev(ctx, start, end, extra = {}) { return published(ctx, start, end, { venue_id: await venue(), ...extra }); }

// ====================================================== conflict detection
test('1. no overlap → no_conflict (timetable present)', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, 1, '09:00', '11:00');
    const r = await check(s, await ev(ctx, at(MON, '12:00'), at(MON, '13:00')));
    assert.equal(r.status, 'no_conflict');
    assert.deepEqual([r.overlap_minutes, r.free_minutes, r.conflicts.length], [0, 60, 0]);
  });
});

test('2. event entirely inside a class → full_conflict', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, 1, '09:00', '11:00');
    const r = await check(s, await ev(ctx, at(MON, '09:30'), at(MON, '10:30')));
    assert.equal(r.status, 'full_conflict');
    assert.deepEqual([r.event_minutes, r.overlap_minutes, r.free_minutes], [60, 60, 0]);
    assert.equal(r.conflicts[0].subject, 'Data Structures');
  });
});

test('3. class entirely inside the event → partial_conflict', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, 1, '09:00', '11:00');
    const r = await check(s, await ev(ctx, at(MON, '08:00'), at(MON, '12:00')));
    assert.equal(r.status, 'partial_conflict');
    assert.deepEqual([r.overlap_minutes, r.free_minutes], [120, 120]);
  });
});

test('4/5. partial overlap at the beginning and at the end', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, 1, '09:00', '11:00');
    const early = await check(s, await ev(ctx, at(MON, '08:00'), at(MON, '10:00'))); // event starts before class
    const late = await check(s, await ev(ctx, at(MON, '10:00'), at(MON, '12:00')));  // event runs past class
    assert.deepEqual([early.status, early.overlap_minutes], ['partial_conflict', 60]);
    assert.deepEqual([late.status, late.overlap_minutes], ['partial_conflict', 60]);
    assert.equal(new Date(late.conflicts[0].overlap_start).toISOString(), new Date(at(MON, '10:00')).toISOString());
    assert.equal(new Date(late.conflicts[0].overlap_end).toISOString(), new Date(at(MON, '11:00')).toISOString());
  });
});

test('6. multiple classes: back-to-back classes covering the event → full; spanning two classes → partial with both listed', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, 1, '09:00', '11:00', 'Data Structures');
    await slot(s, ctx.term, 1, '11:00', '12:00', 'Operating Systems');
    const covered = await check(s, await ev(ctx, at(MON, '10:30'), at(MON, '11:30')));
    assert.deepEqual([covered.status, covered.overlap_minutes, covered.conflicts.length], ['full_conflict', 60, 2]);
    const spans = await check(s, await ev(ctx, at(MON, '10:30'), at(MON, '12:30')));
    assert.deepEqual([spans.status, spans.overlap_minutes, spans.free_minutes], ['partial_conflict', 90, 30]);
    assert.deepEqual(spans.conflicts.map(c => c.subject), ['Data Structures', 'Operating Systems']);
  });
});

test('7. adjacent intervals do not conflict (half-open)', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, 1, '09:00', '11:00');
    assert.equal((await check(s, await ev(ctx, at(MON, '11:00'), at(MON, '12:00')))).status, 'no_conflict');
    assert.equal((await check(s, await ev(ctx, at(MON, '08:00'), at(MON, '09:00')))).status, 'no_conflict');
  });
});

test('8. missing timetable is NOT treated as free', async () => {
  await isolated(db, async () => {
    const ctx = await setup();
    const noSlots = await makeUser(db);
    const e = await ev(ctx, at(MON, '12:00'), at(MON, '13:00'));
    const r = await check(noSlots, e);
    assert.deepEqual([r.status, r.timetable_complete], ['timetable_not_configured', false]);
    // Date outside every term → also "not configured", even with slots elsewhere.
    const s = await makeUser(db);
    await slot(s, ctx.term, 1, '09:00', '11:00');
    const summer = await check(s, await ev(ctx, at('2030-08-05', '12:00'), at('2030-08-05', '13:00')));
    assert.equal(summer.status, 'timetable_not_configured');
  });
});

test('lunch entries are free time, not clashes (migration 13)', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, 1, '11:45', '12:35', 'Data Structures');
    await slot(s, ctx.term, 1, '12:35', '13:25', '  LUNCH break ');
    // Entirely during lunch → no clash, and the timetable counts as entered.
    const r = await check(s, await ev(ctx, at(MON, '12:40'), at(MON, '13:20')));
    assert.deepEqual([r.status, r.timetable_complete, r.conflicts.length], ['no_conflict', true, 0]);
    // Spanning the class and lunch → only the class overlaps.
    const p = await check(s, await ev(ctx, at(MON, '12:00'), at(MON, '13:00')));
    assert.deepEqual([p.status, p.overlap_minutes, p.conflicts.map(c => c.subject)], ['partial_conflict', 35, ['Data Structures']]);
    // A timetable holding only lunch still counts as entered.
    const t = await makeUser(db);
    await slot(t, ctx.term, 2, '11:45', '12:35', 'Lunch');
    assert.equal((await check(t, await ev(ctx, at(MON, '12:00'), at(MON, '13:00')))).status, 'no_conflict');
  });
});

test('only names that ARE lunch are skipped', async () => {
  const names = ['Lunch', 'lunch', 'Lunch Break', 'lunch hour', ' Lunch time ', 'Lunch and Learn', 'Brunch', 'Lunch-break', 'Data Structures'];
  const r = await db.query(`select n, public._is_lunch(n) as lunch from unnest($1::text[]) n`, [names]);
  assert.deepEqual(Object.fromEntries(r.rows.map(x => [x.n, x.lunch])), {
    'Lunch': true, 'lunch': true, 'Lunch Break': true, 'lunch hour': true, ' Lunch time ': true,
    'Lunch and Learn': false, 'Brunch': false, 'Lunch-break': false, 'Data Structures': false,
  });
  await isolated(db, async () => {
    const s = await makeUser(db);
    await asUser(db, s, () => expectFail(db, `select public._is_lunch('Lunch')`, [], '42501'));
  });
});

test('9. a changed event time is re-evaluated (nothing cached)', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, 1, '09:00', '11:00');
    const e = await ev(ctx, at(MON, '12:00'), at(MON, '13:00'));
    assert.equal((await check(s, e)).status, 'no_conflict');
    await db.query('update public.events set starts_at=$2, ends_at=$3, registration_closes_at=$2 where id=$1', [e, at(MON, '10:00'), at(MON, '10:30')]);
    assert.equal((await check(s, e)).status, 'full_conflict');
  });
});

test('events crossing midnight are split by campus day', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, 2, '00:30', '02:00', 'Night Lab'); // Tuesday
    const r = await check(s, await ev(ctx, at(MON, '23:00'), at(TUE, '01:00')));
    assert.deepEqual([r.status, r.overlap_minutes, r.conflicts[0].subject, r.conflicts[0].date], ['partial_conflict', 30, 'Night Lab', TUE]);
  });
});

test('timezone: an event stored in UTC is compared in campus time', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, 1, '09:00', '11:00');
    // 04:00Z–05:00Z = 09:30–10:30 IST
    const r = await check(s, await ev(ctx, '2030-03-04T04:00:00Z', '2030-03-04T05:00:00Z'));
    assert.equal(r.status, 'full_conflict');
  });
});

test('classes on other weekdays never count', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, 1, '09:00', '11:00'); // Monday only
    assert.equal((await check(s, await ev(ctx, at(TUE, '09:00'), at(TUE, '11:00')))).status, 'no_conflict');
  });
});

test('check_timetable_conflict: own timetable only, published events only, signed in only', async () => {
  await isolated(db, async () => {
    const ctx = await setup();
    const draft = await makeEvent(db, ids, ctx.org, { starts_at: at(MON, '12:00'), ends_at: at(MON, '13:00'), registration_opens_at: iso(-86400e3), registration_closes_at: at(MON, '11:00') });
    const s = await makeUser(db);
    await asUser(db, s, () => expectFail(db, 'select public.check_timetable_conflict($1)', [draft], 'not open'));
    await asUser(db, null, () => expectFail(db, 'select public.check_timetable_conflict($1)', [draft], '42501'));
    await asUser(db, s, () => expectFail(db, `select public._timetable_conflict(e, $2) from public.events e where id=$1`, [draft, s], '42501'));
  });
});

// ============================================================ registration
const reg = (s, e) => asUser(db, s, async () => (await one(db, 'select public.register_for_event($1) as r', [e])).r);

test('register: succeeds, stores the conflict snapshot, returns a pass code, notifies', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, 1, '09:00', '11:00');
    const e = await ev(ctx, at(MON, '10:00'), at(MON, '12:00'), { od_eligible: true });
    const r = await reg(s, e);
    assert.match(r.pass_code, /^[0-9a-f]{32}$/);
    assert.equal(r.conflict.status, 'partial_conflict');
    assert.equal(r.seats_left, 99);
    const row = await one(db, 'select conflict_status, conflict_minutes, status from public.event_registrations where id=$1', [r.registration_id]);
    assert.deepEqual(row, { conflict_status: 'partial_conflict', conflict_minutes: 60, status: 'registered' });
    assert.equal((await one(db, `select count(*)::int n from public.notifications where recipient_id=$1 and type='registration_confirmed'`, [s])).n, 1);
  });
});

test('register: duplicate refused', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    const e = await ev(ctx, at(MON, '12:00'), at(MON, '13:00'));
    await reg(s, e);
    await asUser(db, s, () => expectFail(db, 'select public.register_for_event($1)', [e], 'already registered'));
  });
});

test('register: the last seat goes to one student only', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const a = await makeUser(db), b = await makeUser(db);
    const e = await ev(ctx, at(MON, '12:00'), at(MON, '13:00'), { capacity: 1 });
    await reg(a, e);
    await asUser(db, b, () => expectFail(db, 'select public.register_for_event($1)', [e], 'event is full'));
    assert.equal((await one(db, `select count(*)::int n from public.event_registrations where event_id=$1 and status='registered'`, [e])).n, 1);
  });
});

test('register: refused before opening, after the deadline, for unpublished and cancelled events', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    const notOpen = await ev(ctx, at(MON, '12:00'), at(MON, '13:00'), { registration_opens_at: iso(86400e3) });
    const closed = await ev(ctx, at(MON, '14:00'), at(MON, '15:00'), { registration_opens_at: iso(-2 * 86400e3), registration_closes_at: iso(-3600e3) });
    const draft = await makeEvent(db, ids, ctx.org, { venue_id: await venue(), starts_at: at(MON, '16:00'), ends_at: at(MON, '17:00'), registration_opens_at: iso(-86400e3), registration_closes_at: at(MON, '15:00') });
    const cancelled = await ev(ctx, at(TUE, '12:00'), at(TUE, '13:00'));
    await db.query(`update public.events set status='cancelled', cancelled_at=now(), cancellation_reason='Speaker unavailable today.' where id=$1`, [cancelled]);
    await asUser(db, s, async () => {
      await expectFail(db, 'select public.register_for_event($1)', [notOpen], 'Registration opens');
      await expectFail(db, 'select public.register_for_event($1)', [closed], 'has closed');
      await expectFail(db, 'select public.register_for_event($1)', [draft], 'not open for registration');
      await expectFail(db, 'select public.register_for_event($1)', [cancelled], 'not open for registration');
    });
  });
});

test('register: only students (organizers, DSA, visitors refused)', async () => {
  await isolated(db, async () => {
    const ctx = await setup();
    const e = await ev(ctx, at(MON, '12:00'), at(MON, '13:00'));
    for (const who of [ctx.org, ctx.dsa]) await asUser(db, who, () => expectFail(db, 'select public.register_for_event($1)', [e], 'Only signed-in students'));
    await asUser(db, null, () => expectFail(db, 'select public.register_for_event($1)', [e], '42501'));
  });
});

test('register: full conflict on a non-OD event follows the platform setting (D8)', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, 1, '09:00', '11:00');
    const e = await ev(ctx, at(MON, '09:30'), at(MON, '10:30'), { od_eligible: false });
    await db.query(`update public.platform_settings set value='false' where key='allow_registration_on_full_conflict'`);
    await asUser(db, s, () => expectFail(db, 'select public.register_for_event($1)', [e], 'clashes completely'));
    await db.query(`update public.platform_settings set value='true' where key='allow_registration_on_full_conflict'`);
    assert.equal((await reg(s, e)).conflict.status, 'full_conflict');
  });
});

test('cancel registration: frees the seat, withdraws OD, re-register allowed; refused after deadline', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const a = await makeUser(db), b = await makeUser(db);
    const e = await ev(ctx, at(MON, '12:00'), at(MON, '13:00'), { capacity: 1, od_eligible: true });
    const r = await reg(a, e);
    await db.query(`insert into public.od_requests (registration_id, student_id, event_id, reason) values ($1,$2,$3,'Clashes with my lab session')`, [r.registration_id, a, e]);
    await asUser(db, a, () => db.query('select public.cancel_registration($1)', [e]));
    assert.equal((await one(db, 'select status from public.od_requests where registration_id=$1', [r.registration_id])).status, 'withdrawn');
    await reg(b, e);                                                   // seat freed
    await asUser(db, a, () => expectFail(db, 'select public.cancel_registration($1)', [e], 'not registered'));
    await db.query('update public.events set registration_closes_at=$2 where id=$1', [e, iso(-60e3)]);
    await asUser(db, b, () => expectFail(db, 'select public.cancel_registration($1)', [e], 'until the registration deadline'));
  });
});

// ====================================================== seats / registrants
test('seat counts: public numbers only, for public events only', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    const e = await ev(ctx, at(MON, '12:00'), at(MON, '13:00'), { capacity: 40 });
    const draft = await makeEvent(db, ids, ctx.org, { starts_at: at(MON, '16:00'), ends_at: at(MON, '17:00'), registration_opens_at: iso(-86400e3), registration_closes_at: at(MON, '15:00') });
    await reg(s, e);
    const rows = await asUser(db, null, async () => (await db.query('select * from public.get_event_seats($1)', [[e, draft]])).rows);
    assert.deepEqual(rows, [{ event_id: e, registered: 1, capacity: 40 }]);
  });
});

test('registrants: visible to the club’s organizers only, with limited fields', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db, 'student', { full_name: 'Asha Rao' });
    const outsider = await makeUser(db, 'organizer'); await makeClubLead(db, outsider, ids.club2);
    const e = await ev(ctx, at(MON, '12:00'), at(MON, '13:00'));
    await reg(s, e);
    const rows = await asUser(db, ctx.org, async () => (await db.query('select * from public.get_event_registrants($1)', [e])).rows);
    assert.equal(rows[0].full_name, 'Asha Rao');
    assert.ok(!('email' in rows[0]) && !('phone_number' in rows[0]), 'no private contact details');
    for (const who of [outsider, s]) await asUser(db, who, () => expectFail(db, 'select * from public.get_event_registrants($1)', [e], 'Only the club'));
  });
});

// ====================================================== campus-wide warnings
test('warnings: overlapping department events with a shared audience are flagged', async () => {
  await isolated(db, async () => {
    const ctx = await setup();
    const cse = (await one(db, `select id from public.departments where code='CSE'`)).id;
    const ece = (await one(db, `select id from public.departments where code='ECE'`)).id;
    const a = await ev(ctx, at(MON, '10:00'), at(MON, '12:00'), { scope: 'department', title: 'CSE Coding Contest' });
    const b = await ev(ctx, at(MON, '11:00'), at(MON, '13:00'), { scope: 'department', title: 'CSE Guest Lecture' });
    const c = await ev(ctx, at(MON, '11:00'), at(MON, '13:00'), { scope: 'department', title: 'ECE Robotics Demo' });
    const small = await ev(ctx, at(MON, '11:00'), at(MON, '13:00'), { scope: 'club', title: 'Small Club Meetup' });
    for (const [evt, dept] of [[a, cse], [b, cse], [c, ece]]) {
      await db.query('insert into public.event_audiences (event_id, department_id) values ($1,$2)', [evt, dept]);
    }
    const titles = await asUser(db, ctx.dsa, async () => (await db.query('select other_title from public.event_scheduling_warnings($1)', [a])).rows.map(r => r.other_title));
    assert.deepEqual(titles, ['CSE Guest Lecture'], 'ECE audience and club-scope events are not flagged');
    // An event with no audience targets everyone, so it clashes with all.
    const open = await ev(ctx, at(MON, '10:30'), at(MON, '11:30'), { scope: 'university', title: 'All-Campus Assembly' });
    const fromOpen = await asUser(db, ctx.org, async () => (await db.query('select other_title, reason from public.event_scheduling_warnings($1)', [open])).rows);
    assert.ok(fromOpen.some(r => r.other_title === 'CSE Coding Contest' && r.reason.includes('all students')));
    assert.ok(!fromOpen.some(r => r.other_title === 'Small Club Meetup'));
    const student = await makeUser(db);
    await asUser(db, student, () => expectFail(db, 'select * from public.event_scheduling_warnings($1)', [a], 'Only the club'));
  });
});
