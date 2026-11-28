// Migration 14: check_timetable_window, plus the shared clash cases
// (tests/fixtures/schedule-cases.json) run against the REAL database rule.
// web/src/lib/conflict.test.ts runs the same cases against the browser's
// sample-mode engine, so the two implementations cannot disagree.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshDb, isolated, expectFail, one, makeUser, makeEvent, makeClubLead, refIds, asUser } from './harness.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/schedule-cases.json', import.meta.url), 'utf8'));

let db, ids;
before(async () => { db = await freshDb(); ids = await refIds(db); });
after(async () => { await db?.close(); });

async function studentWithFixtureWeek() {
  const s = await makeUser(db);
  for (const x of fixture.slots) {
    await db.query(
      `insert into public.timetable_slots (student_id, term_id, subject_name, day_of_week, start_time, end_time)
       values ($1, (select id from public.academic_terms where name = $2), $3, $4, $5, $6)`,
      [s, x.term, x.subject, x.day, x.start, x.end]);
  }
  return s;
}
const windowCheck = (student, start, end) =>
  asUser(db, student, async () => (await one(db, 'select public.check_timetable_window($1, $2) as r', [start, end])).r);

test('fixture terms match the seeded terms', async () => {
  for (const t of fixture.terms) {
    const row = await one(db, `select starts_on::text, ends_on::text from public.academic_terms where name = $1`, [t.name]);
    assert.deepEqual([row.starts_on, row.ends_on], [t.starts_on, t.ends_on], t.name);
  }
});

for (const c of fixture.cases) {
  test(`shared case: ${c.name}`, async () => {
    await isolated(db, async () => {
      const s = c.empty_timetable ? await makeUser(db) : await studentWithFixtureWeek();
      const r = await windowCheck(s, c.starts_at, c.ends_at);
      assert.equal(r.status, c.status);
      assert.equal(r.event_minutes, c.event_minutes);
      assert.equal(r.overlap_minutes, c.overlap_minutes);
      assert.deepEqual(r.conflicts.map(x => x.subject), c.subjects);
      assert.deepEqual(r.conflicts.map(x => x.overlap_minutes), c.overlaps);
    });
  });
}

test('VentureForge as a REAL published event gives the same answer as the window check, at registration too', async () => {
  await isolated(db, async () => {
    const s = await studentWithFixtureWeek();
    const org = await makeUser(db, 'organizer'); await makeClubLead(db, org, ids.club);
    const dsa = await makeUser(db, 'dsa');
    const venue = (await one(db, `insert into public.venues (name, capacity) values ('Preview Hall', 500) returning id`)).id;
    const vf = fixture.cases[0];
    const iso = ms => new Date(Date.now() + ms).toISOString();
    const eventId = await makeEvent(db, ids, org, {
      starts_at: vf.starts_at, ends_at: vf.ends_at, registration_opens_at: iso(-86400e3), registration_closes_at: vf.starts_at,
      status: 'published', submitted_at: iso(-3 * 86400e3), reviewed_by: dsa, reviewed_at: iso(-2 * 86400e3), published_at: iso(-86400e3),
      venue_id: venue, capacity: 75,
    });
    const viaEvent = await asUser(db, s, async () => (await one(db, 'select public.check_timetable_conflict($1) as r', [eventId])).r);
    const viaWindow = await windowCheck(s, vf.starts_at, vf.ends_at);
    assert.deepEqual({ ...viaWindow, od_eligible: viaEvent.od_eligible }, viaEvent);
    const reg = await asUser(db, s, async () => (await one(db, 'select public.register_for_event($1) as r', [eventId])).r);
    assert.equal(reg.conflict.status, 'partial_conflict');
    assert.equal(reg.conflict.overlap_minutes, 125);
    const snap = await one(db, 'select conflict_status::text, conflict_minutes from public.event_registrations where id = $1', [reg.registration_id]);
    assert.deepEqual([snap.conflict_status, snap.conflict_minutes], ['partial_conflict', 125]);
  });
});

test('window check: own timetable only — another student’s classes are never visible', async () => {
  await isolated(db, async () => {
    const owner = await studentWithFixtureWeek();
    const other = await makeUser(db);
    const vf = fixture.cases[0];
    const r = await windowCheck(other, vf.starts_at, vf.ends_at);
    assert.equal(r.status, 'timetable_not_configured');
    assert.deepEqual(r.conflicts, []);
    // No parameter can name another student.
    await expectFail(db, `select public.check_timetable_window($1, $2, $3)`, [vf.starts_at, vf.ends_at, owner], '42883');
  });
});

test('window check: signed in only; bad windows refused', async () => {
  await isolated(db, async () => {
    const s = await makeUser(db);
    const vf = fixture.cases[0];
    await asUser(db, null, async () => {
      await expectFail(db, 'select public.check_timetable_window($1, $2)', [vf.starts_at, vf.ends_at], '42501');
    });
    await asUser(db, s, async () => {
      await expectFail(db, 'select public.check_timetable_window($1, $2)', [vf.ends_at, vf.starts_at], '22023');
      await expectFail(db, 'select public.check_timetable_window($1, $2)', [vf.starts_at, vf.starts_at], '22023');
      await expectFail(db, 'select public.check_timetable_window($1, $2)', ['2026-12-01T00:00:00+05:30', '2026-12-20T00:00:00+05:30'], '22023');
    });
  });
});

test('window check stores nothing', async () => {
  await isolated(db, async () => {
    const s = await studentWithFixtureWeek();
    const before = await one(db, `select (select count(*) from public.event_registrations)::int r, (select count(*) from public.events)::int e, (select count(*) from public.notifications)::int n`);
    await windowCheck(s, fixture.cases[0].starts_at, fixture.cases[0].ends_at);
    const afterRow = await one(db, `select (select count(*) from public.event_registrations)::int r, (select count(*) from public.events)::int e, (select count(*) from public.notifications)::int n`);
    assert.deepEqual(afterRow, before);
  });
});
