// Migration 12 tests: DSA-hosted events, the DSA head's approval,
// venue requests, and who may upload event posters/banners.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, isolated, expectFail, one, makeUser, makeEvent, makeClubLead, refIds, asUser } from './harness.js';

let db, ids, office;
before(async () => {
  db = await freshDb();
  ids = await refIds(db);
  office = (await one(db, 'select id from public.clubs where is_dsa_office')).id;
});
after(async () => { await db?.close(); });

const H = 3600e3, D = 24 * H;
const iso = ms => new Date(Date.now() + ms).toISOString();
const future = (days = 10, extra = {}) => ({
  starts_at: iso(days * D), ends_at: iso(days * D + 2 * H),
  registration_opens_at: iso(-D), registration_closes_at: iso(days * D - 2 * H), ...extra,
});
const call = (fn, ...args) => `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')})`;
const status = async id => (await one(db, 'select status from public.events where id=$1', [id])).status;

/** Three DSA members; `head` is configured as the DSA head. */
async function dsaBoard() {
  const head = await makeUser(db, 'dsa');
  const member = await makeUser(db, 'dsa');
  const member2 = await makeUser(db, 'dsa');
  const { email } = await one(db, 'select email from public.profiles where id=$1', [head]);
  await db.query(`update public.platform_settings set value = to_jsonb($1::text) where key = 'dsa_head_email'`, [email]);
  return { head, member, member2 };
}
const dsaEvent = (who, extra = {}) => asUser(db, who, () => makeEvent(db, { ...ids, club: office }, who, { ...future(), ...extra }));

// ================================================== DSA events
test('the Office of the DSA exists once, and the head e-mail is a setting', async () => {
  assert.equal((await one(db, 'select count(*)::int n from public.clubs where is_dsa_office')).n, 1);
  await isolated(db, () => expectFail(db, `update public.clubs set is_dsa_office = true where id = $1`, [ids.club], 'clubs_one_dsa_office'));
  assert.ok(await one(db, `select 1 from public.platform_settings where key = 'dsa_head_email'`));
});

test('DSA members draft and submit DSA events; organizers cannot use the DSA office, DSA cannot use other clubs', async () => {
  await isolated(db, async () => {
    const { member } = await dsaBoard();
    const ev = await dsaEvent(member);
    await asUser(db, member, () => db.query(call('submit_event', 1), [ev]));
    assert.equal(await status(ev), 'submitted');

    const org = await makeUser(db, 'organizer');
    await makeClubLead(db, org, ids.club);
    await asUser(db, org, () => expectFail(db,
      `insert into public.events (club_id, created_by, title, description, category_id, event_type, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity)
       values ($1, $2, 'Org in DSA office', 'Should never be allowed here.', $3, 'cultural', now() + interval '9 days', now() + interval '9 days 2 hours', now(), now() + interval '8 days', 10)`,
      [office, org, ids.category], 'row-level security'));
    await asUser(db, member, () => expectFail(db,
      `insert into public.events (club_id, created_by, title, description, category_id, event_type, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity)
       values ($1, $2, 'DSA in a club', 'Should never be allowed here.', $3, 'workshop', now() + interval '9 days', now() + interval '9 days 2 hours', now(), now() + interval '8 days', 10)`,
      [ids.club, member, ids.category], 'row-level security'));
  });
});

test('only the DSA head approves DSA events; other DSA members cannot', async () => {
  await isolated(db, async () => {
    const { head, member, member2 } = await dsaBoard();
    const ev = await dsaEvent(member);
    await asUser(db, member, () => db.query(call('submit_event', 1), [ev]));
    // Only the head was notified about this DSA event.
    const notified = (await db.query(`select recipient_id from public.notifications where related_entity_id=$1 and type='event_submitted'`, [ev])).rows.map(r => r.recipient_id);
    assert.deepEqual(notified, [head]);

    await asUser(db, member2, async () => {
      assert.equal((await one(db, call('can_review_event', 1) + ' as ok', [ev])).ok, false);
      await expectFail(db, call('start_event_review', 1), [ev], 'reviewed by the DSA head');
      await expectFail(db, call('review_event', 1, 2), [ev, 'approve'], 'approved by the DSA head');
    });
    await asUser(db, head, async () => {
      assert.equal((await one(db, call('can_review_event', 1) + ' as ok', [ev])).ok, true);
      await db.query(call('review_event', 1, 2), [ev, 'approve']);
    });
    assert.equal(await status(ev), 'approved');
    // A DSA member publishes it (the office manages its own events).
    await asUser(db, member, () => db.query(call('publish_event', 1), [ev]));
    assert.equal(await status(ev), 'published');
  });
});

test("the head can't approve their own event; another DSA member reviews it", async () => {
  await isolated(db, async () => {
    const { head, member } = await dsaBoard();
    const ev = await dsaEvent(head);
    await asUser(db, head, () => db.query(call('submit_event', 1), [ev]));
    await asUser(db, head, () => expectFail(db, call('review_event', 1, 2), [ev, 'approve'], 'cannot review a proposal you created'));
    await asUser(db, member, () => db.query(call('review_event', 1, 2), [ev, 'approve']));
    assert.equal(await status(ev), 'approved');
  });
});

test('club events: any DSA member still reviews them (head rule applies only to DSA events)', async () => {
  await isolated(db, async () => {
    const { member } = await dsaBoard();
    const org = await makeUser(db, 'organizer');
    await makeClubLead(db, org, ids.club);
    const ev = await makeEvent(db, ids, org, future(15));
    await asUser(db, org, () => db.query(call('submit_event', 1), [ev]));
    await asUser(db, member, () => db.query(call('review_event', 1, 2), [ev, 'approve']));
    assert.equal(await status(ev), 'approved');
  });
});

// ================================================== venue requests
test('a proposal can request an unlisted venue; approval adds it to the list and books it', async () => {
  await isolated(db, async () => {
    const { member: reviewer } = await dsaBoard();
    const org = await makeUser(db, 'organizer');
    await makeClubLead(db, org, ids.club);
    const req = { venue_id: null, requested_venue_name: 'Central Library Lawn', requested_venue_building: 'Library', requested_venue_capacity: 300 };
    const ev = await makeEvent(db, ids, org, { ...future(20), ...req, capacity: 200 });
    const tooBig = await makeEvent(db, ids, org, { ...future(21), ...req, capacity: 400 });
    await asUser(db, org, async () => {
      await db.query(call('submit_event', 1), [ev]);
      await expectFail(db, call('submit_event', 1), [tooBig], 'larger than the requested venue');
    });
    await asUser(db, reviewer, () => db.query(call('review_event', 1, 2), [ev, 'approve']));
    const row = await one(db, `select e.status, v.name, v.capacity, v.building from public.events e join public.venues v on v.id = e.venue_id where e.id=$1`, [ev]);
    assert.deepEqual(row, { status: 'approved', name: 'Central Library Lawn', capacity: 300, building: 'Library' });
    assert.ok(await one(db, `select 1 from public.audit_logs where entity_id=$1 and action='event.approve' and metadata ? 'venue_added'`, [ev]));
  });
});

test('a second request for the same venue name reuses it, and the clash rule refuses an overlap', async () => {
  await isolated(db, async () => {
    const { member: reviewer } = await dsaBoard();
    const org = await makeUser(db, 'organizer');
    await makeClubLead(db, org, ids.club);
    const req = { venue_id: null, requested_venue_name: 'Rooftop Terrace', requested_venue_capacity: 80 };
    const sched = future(25);
    const a = await makeEvent(db, ids, org, { ...sched, ...req, title: 'Rooftop Event One' });
    const b = await makeEvent(db, ids, org, { ...sched, ...req, requested_venue_name: 'rooftop terrace', title: 'Rooftop Event Two' });
    await asUser(db, org, async () => { await db.query(call('submit_event', 1), [a]); await db.query(call('submit_event', 1), [b]); });
    await asUser(db, reviewer, async () => {
      await db.query(call('review_event', 1, 2), [a, 'approve']);
      await expectFail(db, call('review_event', 1, 2), [b, 'approve'], 'already booked for "Rooftop Event One"');
    });
    assert.equal((await one(db, `select count(*)::int n from public.venues where lower(name) = 'rooftop terrace'`)).n, 1);
    assert.equal(await status(b), 'submitted');
  });
});

test('venue requests must be complete, and approved events always hold a real venue', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    await makeClubLead(db, org, ids.club);
    await expectFail(db, `update public.events set requested_venue_name = 'Half request' where id = $1`,
      [await makeEvent(db, ids, org, future())], 'events_venue_request_complete');
    const ev = await makeEvent(db, ids, org, { ...future(30), venue_id: null, requested_venue_name: 'Some Hall', requested_venue_capacity: 100 });
    // Waiting for a decision with only a venue REQUEST is allowed…
    await db.query(`update public.events set status = 'submitted', submitted_at = now() where id = $1`, [ev]);
    // …but approval without a real venue is impossible.
    await expectFail(db, `update public.events set status = 'approved', reviewed_by = $2, reviewed_at = now() where id = $1`,
      [ev, await makeUser(db, 'dsa')], 'events_venue_required');
  });
});

// ================================================== media
test('poster and banner URLs must be https', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    const ev = await makeEvent(db, ids, org, future());
    await expectFail(db, `update public.events set poster_url = 'javascript:alert(1)' where id=$1`, [ev], 'events_poster_url_https');
    await expectFail(db, `update public.events set banner_url = 'http://x.test/a.png' where id=$1`, [ev], 'events_banner_url_https');
    await db.query(`update public.events set poster_url = 'https://x.supabase.co/storage/v1/object/public/event-media/a.webp' where id=$1`, [ev]);
  });
});

test('the event-media bucket is public, image-only and capped at 2 MB', async () => {
  const b = await one(db, `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'event-media'`);
  assert.deepEqual(b, { public: true, file_size_limit: 2097152, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] });
});

test('only the event’s managers upload media, only while it is editable', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    await makeClubLead(db, org, ids.club);
    const otherOrg = await makeUser(db, 'organizer');
    await makeClubLead(db, otherOrg, ids.club2);
    const student = await makeUser(db);
    const ev = await makeEvent(db, ids, org, future());
    const put = path => `insert into storage.objects (bucket_id, name) values ('event-media', '${path}')`;

    await asUser(db, org, () => db.query(put(`${ev}/poster-1.webp`)));
    for (const who of [otherOrg, student, null]) {
      await asUser(db, who, () => expectFail(db, put(`${ev}/poster-2.webp`), [], who ? 'row-level security' : 'permission denied'));
    }
    await asUser(db, org, async () => {
      await expectFail(db, put('not-a-uuid/poster.webp'), [], 'row-level security');
      await expectFail(db, `insert into storage.objects (bucket_id, name) values ('avatars', '${ev}/x.webp')`, [], 'row-level security');
    });
    // Once submitted, the media is frozen like the rest of the proposal.
    await asUser(db, org, () => db.query(call('submit_event', 1), [ev]));
    await asUser(db, org, () => expectFail(db, put(`${ev}/banner-1.webp`), [], 'row-level security'));
  });
});

test('DSA members upload media for DSA events', async () => {
  await isolated(db, async () => {
    const { member } = await dsaBoard();
    const ev = await dsaEvent(member);
    await asUser(db, member, () => db.query(`insert into storage.objects (bucket_id, name) values ('event-media', $1)`, [`${ev}/banner-1.webp`]));
  });
});
