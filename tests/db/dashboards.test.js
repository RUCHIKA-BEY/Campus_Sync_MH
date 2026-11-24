// Stage 8 tests: role dashboards (scoping + numbers) and recommendations.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, isolated, expectFail, one, makeUser, makeEvent, makeClubLead, refIds, asUser } from './harness.js';

let db, ids;
before(async () => { db = await freshDb(); ids = await refIds(db); });
after(async () => { await db?.close(); });

const H = 3600e3, D = 24 * H;
const iso = ms => new Date(Date.now() + ms).toISOString();
let venueNo = 0;

/** Replace the seeded terms with one around today, so timetable checks work on any date. */
async function setup() {
  await db.query('delete from public.academic_terms');
  const term = (await one(db, `insert into public.academic_terms (name, starts_on, ends_on) values ('Dashboard Test Term', current_date - 30, current_date + 120) returning id`)).id;
  const org = await makeUser(db, 'organizer');
  await makeClubLead(db, org, ids.club);
  const dsa = await makeUser(db, 'dsa');
  return { term, org, dsa };
}
async function venue() {
  venueNo += 1;
  return (await one(db, `insert into public.venues (name, capacity) values ($1, 1000) returning id`, [`Dash Venue ${venueNo}`])).id;
}
/** Published event `days` from now, 10:00–12:00 campus time. */
async function event(ctx, days, extra = {}) {
  const date = new Date(Date.now() + days * D).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const start = `${date}T10:00:00+05:30`, end = `${date}T12:00:00+05:30`;
  return makeEvent(db, ids, ctx.org, {
    venue_id: await venue(), starts_at: start, ends_at: end, capacity: 50,
    registration_opens_at: iso(-2 * D), registration_closes_at: new Date(Date.parse(start) - H).toISOString(),
    status: 'published', submitted_at: iso(-3 * D), reviewed_by: ctx.dsa, reviewed_at: iso(-2 * D), published_at: iso(-2 * D), ...extra,
  });
}
const isoDow = days => {
  const name = new Date(Date.now() + days * D).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' });
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(name) + 1;
};
const dash = (who, fn) => asUser(db, who, async () => (await one(db, `select public.${fn}() as d`)).d);
const reg = (s, e) => asUser(db, s, () => db.query('select public.register_for_event($1)', [e]));

// ============================================================ dashboards
test('student dashboard: counts are about the caller only', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const me = await makeUser(db), other = await makeUser(db);
    const e1 = await event(ctx, 5), e2 = await event(ctx, 6);
    await reg(me, e1); await reg(other, e1); await reg(other, e2);
    await db.query('insert into public.club_follows (student_id, club_id) values ($1, $2)', [me, ids.club]);
    const d = await dash(me, 'student_dashboard');
    assert.equal(d.upcoming_registrations, 1);
    assert.equal(d.clubs_followed, 1);
    assert.equal(d.upcoming_public_events, 2);
    assert.equal(d.active_clubs, 6);
    await asUser(db, null, () => expectFail(db, 'select public.student_dashboard()', [], '42501'));
  });
});

test('organizer dashboard: only their clubs; seats and attendance rate computed', async () => {
  await isolated(db, async () => {
    const ctx = await setup();
    const a = await makeUser(db), b = await makeUser(db);
    const upcoming = await event(ctx, 5, { capacity: 10 });
    await reg(a, upcoming);
    // Another club's event must not leak into this dashboard.
    const otherOrg = await makeUser(db, 'organizer'); await makeClubLead(db, otherOrg, ids.club2);
    await makeEvent(db, ids, otherOrg, { club_id: ids.club2, venue_id: await venue(), starts_at: iso(8 * D), ends_at: iso(8 * D + H), registration_opens_at: iso(-D), registration_closes_at: iso(7 * D) });
    // A past event: 2 registered, 1 attended → 50 %.
    const past = await makeEvent(db, ids, ctx.org, {
      venue_id: await venue(), starts_at: iso(-2 * D), ends_at: iso(-2 * D + 2 * H), capacity: 10,
      registration_opens_at: iso(-9 * D), registration_closes_at: iso(-3 * D),
      status: 'published', submitted_at: iso(-8 * D), reviewed_by: ctx.dsa, reviewed_at: iso(-7 * D), published_at: iso(-7 * D) });
    for (const s of [a, b]) await db.query(`insert into public.event_registrations (event_id, student_id, conflict_status) values ($1,$2,'no_conflict')`, [past, s]);
    const ra = (await one(db, 'select id from public.event_registrations where event_id=$1 and student_id=$2', [past, a])).id;
    await db.query(`insert into public.attendance_records (registration_id, event_id, student_id, method, recorded_by) values ($1,$2,$3,'manual',$4)`, [ra, past, a, ctx.org]);

    const d = await dash(ctx.org, 'organizer_dashboard');
    assert.equal(d.total_events, 2, 'other club excluded');
    assert.equal(d.total_registrations, 3);
    assert.equal(d.seats_available, 9);
    assert.equal(Number(d.attendance_rate), 50);
    assert.equal(d.upcoming.length, 1);
    assert.deepEqual([d.upcoming[0].registered, d.upcoming[0].capacity], [1, 10]);
    await asUser(db, a, () => expectFail(db, 'select public.organizer_dashboard()', [], 'Only organizers'));
  });
});

test('DSA dashboard: DSA/admin only; queue and decision numbers', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const admin = await makeUser(db, 'admin'), s = await makeUser(db);
    await makeEvent(db, ids, ctx.org, { venue_id: await venue(), starts_at: iso(9 * D), ends_at: iso(9 * D + H), registration_opens_at: iso(-D), registration_closes_at: iso(8 * D), status: 'submitted', submitted_at: iso(-5 * H) });
    await makeEvent(db, ids, ctx.org, { venue_id: await venue(), starts_at: iso(10 * D), ends_at: iso(10 * D + H), registration_opens_at: iso(-D), registration_closes_at: iso(9 * D),
      status: 'rejected', submitted_at: iso(-10 * H), reviewed_by: ctx.dsa, reviewed_at: iso(-6 * H), review_note: 'Venue unsuitable for this event.' });
    const d = await dash(ctx.dsa, 'dsa_dashboard');
    assert.equal(d.awaiting_review, 1);
    assert.equal(d.rejected_30d, 1);
    assert.equal(Number(d.avg_decision_hours), 4);
    await dash(admin, 'dsa_dashboard');
    for (const who of [s, ctx.org]) await asUser(db, who, () => expectFail(db, 'select public.dsa_dashboard()', [], 'Only DSA'));
  });
});

test('admin dashboard: admin only; trend has 14 days; categories counted', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const admin = await makeUser(db, 'admin'), s = await makeUser(db);
    const e = await event(ctx, 4);
    await reg(s, e);
    const d = await dash(admin, 'admin_dashboard');
    assert.equal(d.registrations_14d.length, 14);
    assert.equal(d.registrations_14d.at(-1).n, 1, 'today counted');
    assert.equal(d.registrations_active, 1);
    assert.ok(d.users_by_role.student >= 1 && d.users_by_role.admin >= 1);
    assert.deepEqual(d.events_by_category, [{ category: 'Technology', n: 1 }]);
    for (const who of [s, ctx.dsa, ctx.org]) await asUser(db, who, () => expectFail(db, 'select public.admin_dashboard()', [], 'Only administrators'));
  });
});

// ======================================================= recommendations
test('recommendations: scored by interests, follows and timetable fit, with reasons', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db);
    const tech = (await one(db, `select id from public.categories where slug='technology'`)).id;
    const music = (await one(db, `select id from public.categories where slug='music'`)).id;
    await db.query('insert into public.student_interests (student_id, category_id) values ($1,$2)', [s, tech]);
    await db.query('insert into public.club_follows (student_id, club_id) values ($1,$2)', [s, ids.club]);
    // The student has class 10:00–11:00 on the weekday 6 days from now.
    await db.query(`insert into public.timetable_slots (student_id, term_id, subject_name, day_of_week, start_time, end_time) values ($1,$2,'Networks',$3,'10:00','11:00')`, [s, ctx.term, isoDow(6)]);

    const best = await event(ctx, 5, { title: 'Tech Talk Fits Timetable' });                       // interest + follow + fits = 7
    const clash = await event(ctx, 6, { title: 'Tech Talk During Class' });                       // interest + follow − clash = 4
    const musicOther = await event(ctx, 7, { title: 'Music Night Other Club', category_id: music, club_id: ids.club2 }); // fits only = 2
    const rows = await asUser(db, s, async () => (await db.query('select * from public.get_recommendations(10)')).rows);
    const byId = Object.fromEntries(rows.map(r => [r.event_id, r]));
    assert.deepEqual(rows.map(r => r.event_id), [best, clash, musicOther], 'sorted by score');
    assert.deepEqual([byId[best].score, byId[clash].score, byId[musicOther].score], [7, 4, 2]);
    assert.deepEqual(byId[best].reasons, ['Matches your interests', 'From a club you follow', 'Fits your timetable']);
    assert.equal(byId[clash].conflict_status, 'partial_conflict');
  });
});

test('recommendations: never suggests registered, full or closed events', async () => {
  await isolated(db, async () => {
    const ctx = await setup(); const s = await makeUser(db), filler = await makeUser(db);
    await db.query(`insert into public.timetable_slots (student_id, term_id, subject_name, day_of_week, start_time, end_time) values ($1,$2,'Any',1,'07:00','08:00')`, [s, ctx.term]);
    const registered = await event(ctx, 5), full = await event(ctx, 6, { capacity: 1 }), closed = await event(ctx, 7, { registration_closes_at: iso(-H) });
    const open = await event(ctx, 8);
    await reg(s, registered);
    await reg(filler, full);
    const ids2 = await asUser(db, s, async () => (await db.query('select event_id from public.get_recommendations(10)')).rows.map(r => r.event_id));
    assert.deepEqual(ids2, [open]);
    await asUser(db, null, () => expectFail(db, 'select * from public.get_recommendations(5)', [], '42501'));
    await asUser(db, s, () => expectFail(db, 'select * from public.recommended_events(5)', [], '42501'));
  });
});

// ======================================================== notifications
test('notifications: a user can mark all of their own as read, and no one else’s', async () => {
  await isolated(db, async () => {
    const a = await makeUser(db), b = await makeUser(db);
    for (const [u, k] of [[a, 'n1'], [a, 'n2'], [b, 'n3']]) await db.query(`select public.notify($1,'test','Hi','There',null,null,$2)`, [u, k]);
    const changed = await asUser(db, a, async () => (await db.query('update public.notifications set is_read = true where is_read = false returning id')).rows.length);
    assert.equal(changed, 2);
    assert.equal((await one(db, 'select count(*)::int n from public.notifications where recipient_id=$1 and not is_read', [b])).n, 1);
  });
});
