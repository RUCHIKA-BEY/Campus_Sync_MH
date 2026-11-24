// Stage 5 tests: the event proposal & approval workflow (migration 8).
// Dates are RELATIVE to "now" so these tests keep passing as time moves on.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, isolated, expectFail, one, makeUser, makeEvent, makeClubLead, refIds, asUser } from './harness.js';

let db, ids;
before(async () => { db = await freshDb(); ids = await refIds(db); });
after(async () => { await db?.close(); });

const H = 3600e3, D = 24 * H;
const iso = ms => new Date(Date.now() + ms).toISOString();
/** A valid future schedule: starts in `days`, lasts 2h, registration open now. */
const future = (days = 10, extra = {}) => ({
  starts_at: iso(days * D), ends_at: iso(days * D + 2 * H),
  registration_opens_at: iso(-D), registration_closes_at: iso(days * D - 2 * H), ...extra,
});
const count = async (sql, params) => (await one(db, `select count(*)::int n from (${sql}) q`, params)).n;
const status = async id => (await one(db, 'select status from public.events where id=$1', [id])).status;
const call = (fn, ...args) => `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')})`;

async function team() {
  const org = await makeUser(db, 'organizer');
  await makeClubLead(db, org, ids.club);
  const dsa = await makeUser(db, 'dsa');
  return { org, dsa };
}

// ============================================================ submit
test('a club lead submits a draft: status, timestamp, DSA notified, audited', async () => {
  await isolated(db, async () => {
    const { org, dsa } = await team();
    const ev = await makeEvent(db, ids, org, future());
    await asUser(db, org, () => db.query(call('submit_event', 1), [ev]));
    const row = await one(db, 'select status, submitted_at from public.events where id=$1', [ev]);
    assert.equal(row.status, 'submitted');
    assert.ok(row.submitted_at);
    assert.equal(await count(`select * from public.notifications where recipient_id=$1 and type='event_submitted'`, [dsa]), 1);
    assert.equal(await count(`select * from public.audit_logs where action='event.submit' and entity_id=$1 and actor_id=$2`, [ev, org]), 1);
  });
});

test('submit validates venue, capacity and dates', async () => {
  await isolated(db, async () => {
    const { org } = await team();
    const noVenue = await makeEvent(db, ids, org, future(10, { venue_id: null }));
    const tooBig = await makeEvent(db, ids, org, future(12, { capacity: 5000 }));
    const past = await makeEvent(db, ids, org, {
      starts_at: iso(-2 * D), ends_at: iso(-2 * D + H), registration_opens_at: iso(-5 * D), registration_closes_at: iso(-3 * D) });
    const deadlinePassed = await makeEvent(db, ids, org, future(14, { registration_opens_at: iso(-3 * D), registration_closes_at: iso(-H) }));
    await asUser(db, org, async () => {
      await expectFail(db, call('submit_event', 1), [noVenue], 'Choose a venue');
      await expectFail(db, call('submit_event', 1), [tooBig], 'larger than');
      await expectFail(db, call('submit_event', 1), [past], 'must start in the future');
      await expectFail(db, call('submit_event', 1), [deadlinePassed], 'deadline has already passed');
    });
  });
});

test('only managers of THAT club can submit; students and DSA cannot', async () => {
  await isolated(db, async () => {
    const { org, dsa } = await team();
    const otherOrg = await makeUser(db, 'organizer');
    await makeClubLead(db, otherOrg, ids.club2);
    const student = await makeUser(db);
    const ev = await makeEvent(db, ids, org, future());
    for (const who of [otherOrg, student, dsa]) {
      await asUser(db, who, () => expectFail(db, call('submit_event', 1), [ev], 'Only organizers who manage this club'));
    }
    assert.equal(await status(ev), 'draft');
  });
});

test('a venue clash at submit names the other event; adjacent slots are fine', async () => {
  await isolated(db, async () => {
    const { org } = await team();
    const first = await makeEvent(db, ids, org, { ...future(20), title: 'First Booking Event' });
    await asUser(db, org, () => db.query(call('submit_event', 1), [first]));
    const f = await one(db, 'select starts_at, ends_at from public.events where id=$1', [first]);
    const overlap = await makeEvent(db, ids, org, {
      starts_at: new Date(f.starts_at.getTime() + H).toISOString(), ends_at: new Date(f.ends_at.getTime() + H).toISOString(),
      registration_opens_at: iso(-D), registration_closes_at: iso(19 * D) });
    const adjacent = await makeEvent(db, ids, org, {
      starts_at: f.ends_at.toISOString(), ends_at: new Date(f.ends_at.getTime() + H).toISOString(),
      registration_opens_at: iso(-D), registration_closes_at: iso(19 * D) });
    await asUser(db, org, async () => {
      await expectFail(db, call('submit_event', 1), [overlap], 'already booked for "First Booking Event"');
      await db.query(call('submit_event', 1), [adjacent]);
    });
    assert.equal(await status(adjacent), 'submitted');
  });
});

test('submitting twice is refused', async () => {
  await isolated(db, async () => {
    const { org } = await team();
    const ev = await makeEvent(db, ids, org, future());
    await asUser(db, org, async () => {
      await db.query(call('submit_event', 1), [ev]);
      await expectFail(db, call('submit_event', 1), [ev], 'Only drafts');
    });
  });
});

// ============================================================ review
test('DSA takes a proposal into review; organizers cannot review', async () => {
  await isolated(db, async () => {
    const { org, dsa } = await team();
    const ev = await makeEvent(db, ids, org, future());
    await asUser(db, org, () => db.query(call('submit_event', 1), [ev]));
    await asUser(db, org, async () => {
      await expectFail(db, call('start_event_review', 1), [ev], 'Only DSA');
      await expectFail(db, `select public.review_event($1, 'approve')`, [ev], 'Only DSA');
    });
    await asUser(db, dsa, () => db.query(call('start_event_review', 1), [ev]));
    assert.equal(await status(ev), 'under_review');
    assert.equal(await count(`select * from public.notifications where recipient_id=$1 and type='event_under_review'`, [org]), 1);
  });
});

test('reject needs a reason; organizer can revise and resubmit (note cleared)', async () => {
  await isolated(db, async () => {
    const { org, dsa } = await team();
    const ev = await makeEvent(db, ids, org, future());
    await asUser(db, org, () => db.query(call('submit_event', 1), [ev]));
    await asUser(db, dsa, async () => {
      await expectFail(db, `select public.review_event($1, 'reject', 'too short')`, [ev], 'at least 10 characters');
      await db.query(`select public.review_event($1, 'reject', 'Clashes with the convocation rehearsal.')`, [ev]);
    });
    let row = await one(db, 'select status, reviewed_by, review_note from public.events where id=$1', [ev]);
    assert.deepEqual(row, { status: 'rejected', reviewed_by: dsa, review_note: 'Clashes with the convocation rehearsal.' });
    assert.equal(await count(`select * from public.notifications where recipient_id=$1 and type='event_rejected'`, [org]), 1);

    await asUser(db, org, async () => {
      // Rejected events are read-only until reopened.
      assert.equal((await db.query(`update public.events set title='Edited while rejected' where id=$1 returning id`, [ev])).rows.length, 0);
      await db.query(call('reopen_event', 1), [ev]);
      assert.equal((await db.query(`update public.events set title='Revised Event Title' where id=$1 returning id`, [ev])).rows.length, 1);
      await db.query(call('submit_event', 1), [ev]);
    });
    row = await one(db, 'select status, review_note, reviewed_by from public.events where id=$1', [ev]);
    assert.deepEqual(row, { status: 'submitted', review_note: null, reviewed_by: null });
  });
});

test('request changes → organizer edits → resubmits', async () => {
  await isolated(db, async () => {
    const { org, dsa } = await team();
    const ev = await makeEvent(db, ids, org, future());
    await asUser(db, org, () => db.query(call('submit_event', 1), [ev]));
    await asUser(db, dsa, () => db.query(`select public.review_event($1, 'request_changes', 'Please lower capacity to 100.')`, [ev]));
    assert.equal(await status(ev), 'changes_requested');
    await asUser(db, org, async () => {
      assert.equal((await db.query(`update public.events set capacity=100 where id=$1 returning id`, [ev])).rows.length, 1);
      await db.query(call('submit_event', 1), [ev]);
    });
    assert.equal(await status(ev), 'submitted');
  });
});

test('unknown decisions are rejected', async () => {
  await isolated(db, async () => {
    const { org, dsa } = await team();
    const ev = await makeEvent(db, ids, org, future());
    await asUser(db, org, () => db.query(call('submit_event', 1), [ev]));
    await asUser(db, dsa, () => expectFail(db, `select public.review_event($1, 'maybe')`, [ev], 'Unknown decision'));
  });
});

// ============================================================ publish
test('approve → publish: followers notified and visitors can now see it', async () => {
  await isolated(db, async () => {
    const { org, dsa } = await team();
    const follower = await makeUser(db);
    await db.query('insert into public.club_follows (student_id, club_id) values ($1, $2)', [follower, ids.club]);
    const ev = await makeEvent(db, ids, org, future());
    await asUser(db, org, () => db.query(call('submit_event', 1), [ev]));
    assert.equal(await asUser(db, null, () => count('select * from public.events where id=$1', [ev])), 0, 'not public while in review');

    await asUser(db, dsa, () => db.query(`select public.review_event($1, 'approve')`, [ev]));
    await asUser(db, follower, () => expectFail(db, call('publish_event', 1), [ev], 'Only the club'));
    await asUser(db, org, () => db.query(call('publish_event', 1), [ev]));

    const row = await one(db, 'select status, published_at from public.events where id=$1', [ev]);
    assert.equal(row.status, 'published');
    assert.ok(row.published_at);
    assert.equal(await count(`select * from public.notifications where recipient_id=$1 and type='club_event_published'`, [follower]), 1);
    assert.equal(await asUser(db, null, () => count('select * from public.events where id=$1', [ev])), 1, 'public after publishing');
  });
});

test('publish is refused unless approved', async () => {
  await isolated(db, async () => {
    const { org } = await team();
    const ev = await makeEvent(db, ids, org, future());
    await asUser(db, org, () => expectFail(db, call('publish_event', 1), [ev], 'Only approved'));
  });
});

// ============================================================ guards
test('the transition trigger refuses illegal jumps even for the database owner', async () => {
  await isolated(db, async () => {
    const { org } = await team();
    const ev = await makeEvent(db, ids, org, future());
    await expectFail(db, `update public.events set status='approved' where id=$1`, [ev], 'Invalid event status change');
    await expectFail(db, `update public.events set status='published', published_at=now() where id=$1`, [ev], 'Invalid event status change');
  });
});

test('internal helper functions cannot be called from the browser', async () => {
  await isolated(db, async () => {
    const { org } = await team();
    const ev = await makeEvent(db, ids, org, future());
    await asUser(db, org, async () => {
      await expectFail(db, `select public._lock_event($1)`, [ev], '42501');
      await expectFail(db, `select public._campus_tz()`, [], '42501');
    });
  });
});

// ============================================================ cancel / complete
test('cancel needs a reason; registrants are notified; event stays visible as cancelled', async () => {
  await isolated(db, async () => {
    const { org, dsa } = await team();
    const student = await makeUser(db);
    const ev = await makeEvent(db, ids, org, future());
    await asUser(db, org, () => db.query(call('submit_event', 1), [ev]));
    await asUser(db, dsa, () => db.query(`select public.review_event($1, 'approve')`, [ev]));
    await asUser(db, org, () => db.query(call('publish_event', 1), [ev]));
    await db.query(`insert into public.event_registrations (event_id, student_id, conflict_status) values ($1, $2, 'no_conflict')`, [ev, student]);

    await asUser(db, student, () => expectFail(db, `select public.cancel_event($1, 'I would like to cancel it')`, [ev], 'cannot cancel'));
    await asUser(db, org, async () => {
      await expectFail(db, `select public.cancel_event($1, 'rain')`, [ev], 'at least 10 characters');
      await db.query(`select public.cancel_event($1, 'Speaker unavailable due to travel.')`, [ev]);
    });
    assert.equal(await status(ev), 'cancelled');
    assert.equal(await count(`select * from public.notifications where recipient_id=$1 and type='event_cancelled'`, [student]), 1);
    assert.equal(await asUser(db, null, () => count(`select * from public.events where id=$1 and status='cancelled'`, [ev])), 1);
    await asUser(db, org, () => expectFail(db, `select public.cancel_event($1, 'Cancelling a second time.')`, [ev], 'cannot be cancelled'));
  });
});

test('complete only after the event has ended', async () => {
  await isolated(db, async () => {
    const { org, dsa } = await team();
    const upcoming = await makeEvent(db, ids, org, future());
    await asUser(db, org, () => db.query(call('submit_event', 1), [upcoming]));
    await asUser(db, dsa, () => db.query(`select public.review_event($1, 'approve')`, [upcoming]));
    await asUser(db, org, () => db.query(call('publish_event', 1), [upcoming]));
    await asUser(db, org, () => expectFail(db, call('complete_event', 1), [upcoming], 'not ended yet'));

    // A past, published event (set up directly by the owner).
    const past = await makeEvent(db, ids, org, {
      venue_id: ids.venue2, starts_at: iso(-3 * D), ends_at: iso(-3 * D + 2 * H),
      registration_opens_at: iso(-10 * D), registration_closes_at: iso(-4 * D),
      status: 'published', submitted_at: iso(-9 * D), reviewed_by: dsa, reviewed_at: iso(-8 * D), published_at: iso(-8 * D) });
    await asUser(db, org, () => db.query(call('complete_event', 1), [past]));
    assert.equal(await status(past), 'completed');
  });
});
