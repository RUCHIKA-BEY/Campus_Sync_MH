// Stage 7 tests: On-Duty requests and QR / manual attendance.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, isolated, expectFail, one, makeUser, makeEvent, makeClubLead, refIds, asUser } from './harness.js';

let db, ids;
before(async () => { db = await freshDb(); ids = await refIds(db); });
after(async () => { await db?.close(); });

const MIN = 60e3, H = 60 * MIN, D = 24 * H;
const iso = ms => new Date(Date.now() + ms).toISOString();
const MON = '2030-03-04';
const at = t => `${MON}T${t}:00+05:30`;
let venueNo = 0;

async function setup() {
  const term = (await one(db, `insert into public.academic_terms (name, starts_on, ends_on) values ('2030 Test Term', '2030-01-01', '2030-06-30') returning id`)).id;
  const org = await makeUser(db, 'organizer');
  await makeClubLead(db, org, ids.club);
  const dsa = await makeUser(db, 'dsa');
  return { term, org, dsa };
}
async function published(ctx, start, end, extra = {}) {
  venueNo += 1;
  const venue = (await one(db, `insert into public.venues (name, capacity) values ($1, 1000) returning id`, [`OD Venue ${venueNo}`])).id;
  return makeEvent(db, ids, ctx.org, {
    venue_id: venue, starts_at: start, ends_at: end, capacity: 100,
    registration_opens_at: iso(-2 * D), registration_closes_at: new Date(Math.min(Date.parse(start), Date.now() + 10 * MIN)).toISOString(),
    status: 'published', submitted_at: iso(-3 * D), reviewed_by: ctx.dsa, reviewed_at: iso(-2 * D), published_at: iso(-2 * D), ...extra,
  });
}
async function registerAs(student, eventId) {
  return asUser(db, student, async () => (await one(db, 'select public.register_for_event($1) as r', [eventId])).r);
}
async function slot(student, term, start, end) {
  await db.query(`insert into public.timetable_slots (student_id, term_id, subject_name, day_of_week, start_time, end_time) values ($1,$2,'Data Structures',1,$3,$4)`, [student, term, start, end]);
}
const requestOd = (s, e, reason = 'This clashes with my Data Structures lecture.') =>
  asUser(db, s, async () => (await one(db, 'select public.request_od($1, $2) as id', [e, reason])).id);

// ================================================================== OD
test('OD: a registered student with a real clash can request; reviewers notified; evidence stored', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, '09:00', '11:00');
    const e = await published(ctx, at('10:00'), at('12:00'), { od_eligible: true });
    await registerAs(s, e);
    const id = await requestOd(s, e);
    const row = await one(db, 'select status, conflict_snapshot from public.od_requests where id=$1', [id]);
    assert.equal(row.status, 'pending');
    assert.equal(row.conflict_snapshot[0].subject, 'Data Structures');
    assert.equal((await one(db, `select count(*)::int n from public.notifications where recipient_id=$1 and type='od_requested'`, [ctx.dsa])).n, 1);
  });
});

test('OD: refused without registration, for non-OD events, without a clash, or without a timetable', async () => {
  await isolated(db, async () => {
    const ctx = await setup();
    const withClass = await makeUser(db); await slot(withClass, ctx.term, '09:00', '11:00');
    const noTimetable = await makeUser(db);
    const odEvent = await published(ctx, at('10:00'), at('12:00'), { od_eligible: true });
    const notOd = await published(ctx, at('10:00'), at('12:00'), { od_eligible: false });
    const noClash = await published(ctx, at('13:00'), at('14:00'), { od_eligible: true });

    await asUser(db, withClass, () => expectFail(db, 'select public.request_od($1, $2)', [odEvent, 'Clashes with my DS lecture.'], 'Register for the event'));
    await registerAs(withClass, notOd);
    await asUser(db, withClass, () => expectFail(db, 'select public.request_od($1, $2)', [notOd, 'Clashes with my DS lecture.'], 'not OD-eligible'));
    await registerAs(withClass, noClash);
    await asUser(db, withClass, () => expectFail(db, 'select public.request_od($1, $2)', [noClash, 'I would like OD anyway.'], 'isn’t needed'));
    await registerAs(noTimetable, odEvent);
    await asUser(db, noTimetable, () => expectFail(db, 'select public.request_od($1, $2)', [odEvent, 'Clashes with my classes today.'], 'Add your timetable'));
  });
});

test('OD: duplicate active request refused; short reason refused', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    await slot(s, ctx.term, '09:00', '11:00');
    const e = await published(ctx, at('10:00'), at('12:00'), { od_eligible: true });
    await registerAs(s, e);
    await asUser(db, s, () => expectFail(db, 'select public.request_od($1, $2)', [e, 'short'], 'at least 10'));
    await requestOd(s, e);
    await asUser(db, s, () => expectFail(db, 'select public.request_od($1, $2)', [e, 'Asking again for the same event.'], 'already have an active'));
  });
});

test('OD: reviewer approves (no attendance created) or rejects with a reason; student notified; audited', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const a = await makeUser(db), b = await makeUser(db);
    for (const s of [a, b]) await slot(s, ctx.term, '09:00', '11:00');
    const e = await published(ctx, at('10:00'), at('12:00'), { od_eligible: true });
    await registerAs(a, e); await registerAs(b, e);
    const odA = await requestOd(a, e), odB = await requestOd(b, e);
    await asUser(db, ctx.dsa, async () => {
      await db.query(`select public.decide_od($1, 'approve')`, [odA]);
      await expectFail(db, `select public.decide_od($1, 'reject', 'no')`, [odB], 'at least 10');
      await db.query(`select public.decide_od($1, 'reject', 'Lab attendance is compulsory this week.')`, [odB]);
      await expectFail(db, `select public.decide_od($1, 'approve')`, [odA], 'already been approved');
    });
    assert.equal((await one(db, 'select status from public.od_requests where id=$1', [odA])).status, 'approved');
    assert.equal((await one(db, 'select count(*)::int n from public.attendance_records where student_id=$1', [a])).n, 0, 'OD approval ≠ attendance');
    assert.equal((await one(db, `select count(*)::int n from public.notifications where recipient_id=$1 and type='od_rejected'`, [b])).n, 1);
    assert.equal((await one(db, `select count(*)::int n from public.audit_logs where action in ('od.approve','od.reject')`)).n, 2);
  });
});

test('OD: students and organizers cannot decide; reviewer role is configurable', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db), admin = await makeUser(db, 'admin');
    await slot(s, ctx.term, '09:00', '11:00');
    const e = await published(ctx, at('10:00'), at('12:00'), { od_eligible: true });
    await registerAs(s, e);
    const od = await requestOd(s, e);
    for (const who of [s, ctx.org, admin]) {
      await asUser(db, who, () => expectFail(db, `select public.decide_od($1, 'approve')`, [od], 'not an authorised'));
    }
    await db.query(`update public.platform_settings set value='["admin"]' where key='od_reviewer_roles'`);
    await asUser(db, ctx.dsa, () => expectFail(db, `select public.decide_od($1, 'approve')`, [od], 'not an authorised'));
    await asUser(db, admin, () => db.query(`select public.decide_od($1, 'approve')`, [od]));
  });
});

test('OD: student withdraws own pending request; queue and own list show the right rows', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db, 'student', { full_name: 'Meera Iyer' }), other = await makeUser(db);
    await slot(s, ctx.term, '09:00', '11:00');
    const e = await published(ctx, at('10:00'), at('12:00'), { od_eligible: true });
    await registerAs(s, e);
    const od = await requestOd(s, e);
    const queue = await asUser(db, ctx.dsa, async () => (await db.query('select student_name, event_title from public.get_od_queue()')).rows);
    assert.equal(queue[0].student_name, 'Meera Iyer');
    await asUser(db, s, () => expectFail(db, 'select * from public.get_od_queue()', [], 'not an authorised'));
    await asUser(db, other, () => expectFail(db, 'select public.withdraw_od($1)', [od], 'Only your own'));
    const mine = await asUser(db, s, async () => (await db.query('select status from public.my_od_requests()')).rows);
    assert.deepEqual(mine, [{ status: 'pending' }]);
    await asUser(db, s, () => db.query('select public.withdraw_od($1)', [od]));
    assert.equal((await one(db, 'select status from public.od_requests where id=$1', [od])).status, 'withdrawn');
  });
});

// ========================================================== attendance
// Events "happening now-ish" (check-in depends on the real clock).
async function liveEvent(ctx, extra = {}) {
  return published(ctx, iso(30 * MIN), iso(3 * H), extra);
}
const pass = async (student, eventId) => (await one(db, `select pass_code from public.event_registrations where student_id=$1 and event_id=$2 and status='registered'`, [student, eventId])).pass_code;
const openSession = (ctx, e, minutes = 60) => asUser(db, ctx.org, () => db.query('select public.open_attendance_session($1, $2)', [e, minutes]));
const checkIn = (who, e, code) => asUser(db, who, async () => (await one(db, 'select public.check_in($1, $2) as r', [e, code])).r);

test('check-in: needs an open session; validates pass, event and duplicates; returns the name', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db, 'student', { full_name: 'Kabir Shah' });
    const e = await liveEvent(ctx);
    await registerAs(s, e);
    const code = await pass(s, e);
    await asUser(db, ctx.org, () => expectFail(db, 'select public.check_in($1,$2)', [e, code], 'Check-in is closed'));
    await openSession(ctx, e);
    const r = await checkIn(ctx.org, e, `CAMPUSSYNC|${code.toUpperCase()}`); // QR prefix + case don't matter
    assert.equal(r.student_name, 'Kabir Shah');
    await asUser(db, ctx.org, async () => {
      await expectFail(db, 'select public.check_in($1,$2)', [e, code], 'Already checked in');
      await expectFail(db, 'select public.check_in($1,$2)', [e, 'not-a-pass'], 'not a CampusSync pass');
      await expectFail(db, 'select public.check_in($1,$2)', [e, 'f'.repeat(32)], 'Unknown pass');
    });
    const row = await one(db, 'select method, session_id is not null as has_session from public.attendance_records where student_id=$1', [s]);
    assert.deepEqual(row, { method: 'qr', has_session: true });
    assert.equal((await one(db, `select count(*)::int n from public.notifications where recipient_id=$1 and type='attendance_confirmed'`, [s])).n, 1);
  });
});

test('check-in: a pass for another event is refused; a cancelled registration is refused', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db), t = await makeUser(db);
    const e1 = await liveEvent(ctx), e2 = await liveEvent(ctx);
    await registerAs(s, e2);
    await registerAs(t, e1);
    const tCode = await pass(t, e1);
    await asUser(db, t, () => db.query('select public.cancel_registration($1)', [e1]));
    await openSession(ctx, e1);
    await asUser(db, ctx.org, async () => {
      await expectFail(db, 'select public.check_in($1,$2)', [e1, await pass(s, e2)], 'different event');
      await expectFail(db, 'select public.check_in($1,$2)', [e1, tCode], 'cancelled');
    });
  });
});

test('check-in: an expired or closed session is refused (time limit)', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    const e = await liveEvent(ctx);
    await registerAs(s, e);
    const code = await pass(s, e);
    await openSession(ctx, e);
    await db.query(`update public.attendance_sessions set opens_at = now() - interval '2 hours', closes_at = now() - interval '1 minute' where event_id=$1`, [e]);
    await asUser(db, ctx.org, () => expectFail(db, 'select public.check_in($1,$2)', [e, code], 'Check-in is closed'));
    await openSession(ctx, e);
    const sid = (await one(db, 'select id from public.attendance_sessions where event_id=$1 and closed_early_at is null and closes_at > now()', [e])).id;
    await asUser(db, ctx.org, () => db.query('select public.close_attendance_session($1)', [sid]));
    await asUser(db, ctx.org, () => expectFail(db, 'select public.check_in($1,$2)', [e, code], 'Check-in is closed'));
  });
});

test('attendance sessions: only club organizers, only around the event time', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    const other = await makeUser(db, 'organizer'); await makeClubLead(db, other, ids.club2);
    const e = await liveEvent(ctx);
    const far = await published(ctx, iso(3 * D), iso(3 * D + H));
    for (const who of [s, other, ctx.dsa]) {
      await asUser(db, who, () => expectFail(db, 'select public.open_attendance_session($1, 60)', [e], 'Only this club'));
    }
    await asUser(db, ctx.org, () => expectFail(db, 'select public.open_attendance_session($1, 60)', [far], '2 hours before'));
    await asUser(db, ctx.org, () => expectFail(db, 'select public.open_attendance_session($1, 2)', [e], 'between 5 and 720'));
  });
});

test('students cannot check themselves in or write attendance directly', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    const e = await liveEvent(ctx);
    const r = await registerAs(s, e);
    await openSession(ctx, e);
    await asUser(db, s, async () => {
      await expectFail(db, 'select public.check_in($1,$2)', [e, r.pass_code], 'Only this club');
      await expectFail(db, 'select public.mark_attendance_manual($1)', [r.registration_id], 'Only this club');
      await expectFail(db, `insert into public.attendance_records (registration_id, event_id, student_id, method, recorded_by) values ($1,$2,$3,'manual',$3)`, [r.registration_id, e, s], '42501');
    });
  });
});

test('manual attendance: recorded as manual, audited, no duplicates; revoke needs a reason', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    const e = await liveEvent(ctx);
    const r = await registerAs(s, e);
    await asUser(db, ctx.org, async () => {
      await db.query('select public.mark_attendance_manual($1)', [r.registration_id]);
      await expectFail(db, 'select public.mark_attendance_manual($1)', [r.registration_id], 'Already marked');
      await expectFail(db, 'select public.revoke_attendance($1, $2)', [r.registration_id, 'oops'], 'at least 10');
      await db.query('select public.revoke_attendance($1, $2)', [r.registration_id, 'Marked the wrong student by mistake.']);
    });
    const a = await one(db, 'select method, verification_status from public.attendance_records where registration_id=$1', [r.registration_id]);
    assert.deepEqual(a, { method: 'manual', verification_status: 'revoked' });
    assert.equal((await one(db, `select count(*)::int n from public.audit_logs where action in ('attendance.manual_mark','attendance.revoke')`)).n, 2);
  });
});

test('attendance views: organizer roster with open session; student sees own history only', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const a = await makeUser(db, 'student', { full_name: 'Anya Das' }), b = await makeUser(db);
    const e = await liveEvent(ctx);
    await registerAs(a, e); await registerAs(b, e);
    await openSession(ctx, e);
    await checkIn(ctx.org, e, await pass(a, e));
    const roster = await asUser(db, ctx.org, async () => (await db.query('select full_name, checked_in_at is not null as present, open_session_id is not null as open from public.get_event_attendance($1)', [e])).rows);
    assert.equal(roster.length, 2);
    assert.deepEqual(roster[0], { full_name: 'Anya Das', present: true, open: true });
    await asUser(db, b, () => expectFail(db, 'select * from public.get_event_attendance($1)', [e], 'Only the club'));
    assert.equal(await asUser(db, a, async () => (await db.query('select * from public.my_attendance()')).rows.length), 1);
    assert.equal(await asUser(db, b, async () => (await db.query('select * from public.my_attendance()')).rows.length), 0);
  });
});
