// Stage 4 tests: signup → profile, role protection, and RLS per role.
// Every test runs real SQL as a simulated browser user (role
// `authenticated` + JWT subject) or a logged-out visitor (`anon`),
// exactly what Supabase does for requests made with the publishable key.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, isolated, expectFail, expectFailFn, one, makeUser, makeEvent, makeClubLead, refIds, asUser } from './harness.js';

let db, ids;
before(async () => { db = await freshDb(); ids = await refIds(db); });
after(async () => { await db?.close(); });

const SUBMITTED = { status: 'submitted', submitted_at: '2026-11-11 10:00+05:30' };
const PUBLISHED = { status: 'published', submitted_at: '2026-11-10 10:00+05:30', published_at: '2026-11-11 10:00+05:30' };
const count = async (sql, params) => (await one(db, `select count(*)::int n from (${sql}) q`, params)).n;
const PERMISSION_DENIED = '42501';
const RLS_VIOLATION = 'row-level security';

// ================================================================ signup
test('signup creates a student profile in the same transaction', async () => {
  await isolated(db, async () => {
    const { id } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('priya@uni.test',
      '{"full_name":"Priya Sharma","registration_number":"22cs1042","department_code":"cse","academic_year":"3"}') returning id`);
    const p = await one(db, `select p.role, p.full_name, p.email, p.registration_number, p.academic_year, d.code
                             from public.profiles p left join public.departments d on d.id = p.department_id where p.id = $1`, [id]);
    assert.deepEqual(p, { role: 'student', full_name: 'Priya Sharma', email: 'priya@uni.test',
                          registration_number: '22CS1042', academic_year: 3, code: 'CSE' });
  });
});

test('signup IGNORES a requested role: {"role":"admin"} still becomes student', async () => {
  await isolated(db, async () => {
    const { id } = await one(db, `insert into auth.users (email, raw_user_meta_data)
      values ('sneaky@uni.test', '{"full_name":"Sneaky","role":"admin"}') returning id`);
    assert.equal((await one(db, 'select role from public.profiles where id=$1', [id])).role, 'student');
  });
});

test('signup sanitises bad metadata instead of failing', async () => {
  await isolated(db, async () => {
    await one(db, `insert into auth.users (email, raw_user_meta_data) values ('first@uni.test', '{"registration_number":"TAKEN1"}') returning id`);
    const { id } = await one(db, `insert into auth.users (email, raw_user_meta_data) values ('x.y@uni.test',
      '{"full_name":" ","registration_number":"TAKEN1","department_code":"NOPE","academic_year":"9"}') returning id`);
    const p = await one(db, 'select full_name, registration_number, department_id, academic_year from public.profiles where id=$1', [id]);
    assert.deepEqual(p, { full_name: 'x.y', registration_number: null, department_id: null, academic_year: null });
  });
});

test('changing the login email updates profiles.email', async () => {
  await isolated(db, async () => {
    const u = await makeUser(db);
    await db.query(`update auth.users set email = 'new.address@uni.test' where id = $1`, [u]);
    assert.equal((await one(db, 'select email from public.profiles where id=$1', [u])).email, 'new.address@uni.test');
  });
});

// ============================================================== profiles
test('student can edit own personal fields but NOT role, is_active or email', async () => {
  await isolated(db, async () => {
    const s = await makeUser(db);
    await asUser(db, s, async () => {
      const r = await db.query(`update public.profiles set full_name = 'Renamed Student', semester = 5 where id = $1 returning id`, [s]);
      assert.equal(r.rows.length, 1);
      await expectFail(db, `update public.profiles set role = 'admin' where id = $1`, [s], PERMISSION_DENIED);
      await expectFail(db, `update public.profiles set is_active = true where id = $1`, [s], PERMISSION_DENIED);
      await expectFail(db, `update public.profiles set email = 'x@y.z' where id = $1`, [s], PERMISSION_DENIED);
      await expectFail(db, `insert into public.profiles (id, full_name, email) values (gen_random_uuid(), 'Fake', 'f@k.e')`, [], PERMISSION_DENIED);
    });
    assert.equal((await one(db, 'select role from public.profiles where id=$1', [s])).role, 'student');
  });
});

test('student cannot read or edit another student\'s profile', async () => {
  await isolated(db, async () => {
    const a = await makeUser(db), b = await makeUser(db);
    await asUser(db, a, async () => {
      assert.equal(await count('select * from public.profiles'), 1, 'sees only own profile');
      const r = await db.query(`update public.profiles set full_name = 'Hijacked' where id = $1 returning id`, [b]);
      assert.equal(r.rows.length, 0);
    });
    assert.notEqual((await one(db, 'select full_name from public.profiles where id=$1', [b])).full_name, 'Hijacked');
  });
});

test('DSA and admin can read all profiles; organizer cannot', async () => {
  await isolated(db, async () => {
    await makeUser(db); await makeUser(db);
    const dsa = await makeUser(db, 'dsa'), admin = await makeUser(db, 'admin'), org = await makeUser(db, 'organizer');
    const total = await count('select * from public.profiles');
    assert.equal(await asUser(db, dsa, () => count('select * from public.profiles')), total);
    assert.equal(await asUser(db, admin, () => count('select * from public.profiles')), total);
    assert.equal(await asUser(db, org, () => count('select * from public.profiles')), 1);
  });
});

test('logged-out visitors cannot read profiles or terms', async () => {
  await isolated(db, async () => {
    await makeUser(db);
    await asUser(db, null, async () => {
      // Visitors hold no GRANT on these tables at all (migration 7), so the
      // request is refused before RLS even runs.
      await expectFail(db, 'select * from public.profiles', [], PERMISSION_DENIED);
      await expectFail(db, 'select * from public.academic_terms', [], PERMISSION_DENIED);
      assert.ok(await count('select * from public.categories') > 0, 'categories are public');
    });
  });
});

// ======================================================= role management
test('only an admin can change roles; changes are audited and notified', async () => {
  await isolated(db, async () => {
    const s = await makeUser(db), admin = await makeUser(db, 'admin'), dsa = await makeUser(db, 'dsa');
    await asUser(db, s, () => expectFail(db, `select public.admin_set_user_role($1, 'admin')`, [s], 'Only administrators'));
    await asUser(db, dsa, () => expectFail(db, `select public.admin_set_user_role($1, 'organizer')`, [s], 'Only administrators'));
    await asUser(db, admin, () => db.query(`select public.admin_set_user_role($1, 'organizer')`, [s]));
    assert.equal((await one(db, 'select role from public.profiles where id=$1', [s])).role, 'organizer');
    const log = await one(db, `select actor_id, metadata from public.audit_logs where action='role.change' and entity_id=$1`, [s]);
    assert.equal(log.actor_id, admin);
    assert.deepEqual(log.metadata, { old_role: 'student', new_role: 'organizer' });
    assert.equal(await count(`select * from public.notifications where recipient_id=$1 and type='role_changed'`, [s]), 1);
  });
});

test('an admin cannot change their own role or deactivate themselves', async () => {
  await isolated(db, async () => {
    const admin = await makeUser(db, 'admin');
    await asUser(db, admin, async () => {
      await expectFail(db, `select public.admin_set_user_role($1, 'student')`, [admin], 'cannot change their own role');
      await expectFail(db, `select public.admin_set_user_active($1, false)`, [admin], 'cannot deactivate themselves');
    });
  });
});

test('a deactivated admin loses admin powers', async () => {
  await isolated(db, async () => {
    const a1 = await makeUser(db, 'admin'), a2 = await makeUser(db, 'admin'), s = await makeUser(db);
    await asUser(db, a1, () => db.query('select public.admin_set_user_active($1, false)', [a2]));
    await asUser(db, a2, async () => {
      await expectFail(db, `select public.admin_set_user_role($1, 'dsa')`, [s], 'Only administrators');
      assert.equal(await count('select * from public.audit_logs'), 0);
    });
  });
});

test('internal helpers write_audit / notify cannot be called from the browser', async () => {
  await isolated(db, async () => {
    const s = await makeUser(db);
    await asUser(db, s, async () => {
      await expectFail(db, `select public.write_audit('fake.entry', 'x', null, '{}')`, [], PERMISSION_DENIED);
      await expectFail(db, `select public.notify($1, 'x', 'Fake', 'Fake', null, null, 'k')`, [s], PERMISSION_DENIED);
    });
  });
});

// ================================================================ events
test('visitors and students see only public events (no drafts/submitted)', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer'), s = await makeUser(db);
    await makeEvent(db, ids, org);                                            // draft
    await makeEvent(db, ids, org, { ...SUBMITTED, venue_id: ids.venue2 });    // submitted
    const pub = await makeEvent(db, ids, org, { ...PUBLISHED, starts_at: '2026-12-02 10:00+05:30', ends_at: '2026-12-02 12:00+05:30', registration_closes_at: '2026-12-01 23:00+05:30' });
    for (const who of [null, s]) {
      const rows = await asUser(db, who, async () => (await db.query('select id from public.events')).rows);
      assert.deepEqual(rows.map(r => r.id), [pub]);
    }
  });
});

test('organizer (club lead) creates a draft for their club only, as themselves', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer'), other = await makeUser(db, 'organizer');
    await makeClubLead(db, org, ids.club);
    await asUser(db, org, async () => {
      const ev = await makeEvent(db, ids, org);
      assert.equal((await one(db, 'select status from public.events where id=$1', [ev])).status, 'draft');
      await expectFail(db, `insert into public.events (club_id, created_by, title, description, category_id, event_type, venue_id, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity)
        values ($1,$2,'Other club event','Long enough description',$3,'workshop',$4,'2026-12-05 10:00+05:30','2026-12-05 11:00+05:30','2026-11-20','2026-12-04',10)`,
        [ids.club2, org, ids.category, ids.venue], RLS_VIOLATION);                       // not their club
      await expectFail(db, `insert into public.events (club_id, created_by, title, description, category_id, event_type, venue_id, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity)
        values ($1,$2,'Impersonated event','Long enough description',$3,'workshop',$4,'2026-12-05 10:00+05:30','2026-12-05 11:00+05:30','2026-11-20','2026-12-04',10)`,
        [ids.club, other, ids.category, ids.venue], RLS_VIOLATION);                      // created_by someone else
    });
  });
});

test('organizer cannot insert an event that is already approved/published', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    await makeClubLead(db, org, ids.club);
    await asUser(db, org, () => expectFail(db,
      `insert into public.events (club_id, created_by, title, description, category_id, event_type, venue_id, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity, status)
       values ($1,$2,'Sneaky published','Long enough description',$3,'workshop',$4,'2026-12-05 10:00+05:30','2026-12-05 11:00+05:30','2026-11-20','2026-12-04',10,'published')`,
      [ids.club, org, ids.category, ids.venue], PERMISSION_DENIED));
  });
});

test('organizer CANNOT approve or publish their own event (status not writable)', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    await makeClubLead(db, org, ids.club);
    const ev = await makeEvent(db, ids, org, SUBMITTED);
    await asUser(db, org, async () => {
      await expectFail(db, `update public.events set status = 'approved' where id = $1`, [ev], PERMISSION_DENIED);
      await expectFail(db, `update public.events set reviewed_by = $2 where id = $1`, [ev, org], PERMISSION_DENIED);
      // Descriptive edits are also locked once submitted (0 rows match):
      const r = await db.query(`update public.events set title = 'Changed after submit' where id = $1 returning id`, [ev]);
      assert.equal(r.rows.length, 0);
    });
  });
});

test('student and DSA cannot change event status directly either', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer'), s = await makeUser(db), dsa = await makeUser(db, 'dsa');
    const ev = await makeEvent(db, ids, org, SUBMITTED);
    for (const who of [s, dsa]) {
      await asUser(db, who, () => expectFail(db, `update public.events set status = 'approved' where id = $1`, [ev], PERMISSION_DENIED));
    }
  });
});

test('organizer can edit own club drafts but not another club\'s events', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer'), org2 = await makeUser(db, 'organizer');
    await makeClubLead(db, org, ids.club);
    await makeClubLead(db, org2, ids.club2);
    const mine = await makeEvent(db, ids, org);
    const theirs = await makeEvent(db, ids, org2, { club_id: ids.club2 });
    await asUser(db, org, async () => {
      assert.equal((await db.query(`update public.events set title = 'Edited my draft' where id = $1 returning id`, [mine])).rows.length, 1);
      assert.equal((await db.query(`update public.events set title = 'Edited theirs!!' where id = $1 returning id`, [theirs])).rows.length, 0);
      assert.equal((await db.query(`delete from public.events where id = $1 returning id`, [theirs])).rows.length, 0);
      await expectFail(db, `update public.events set club_id = $2 where id = $1`, [mine, ids.club2], RLS_VIOLATION); // can't move it to a club you don't manage
    });
  });
});

test('organizer role alone (without club membership) grants nothing; demotion revokes access', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    const ev = await makeEvent(db, ids, org);
    assert.equal(await asUser(db, org, () => count('select * from public.events where id = $1', [ev])), 0);
    await makeClubLead(db, org, ids.club);
    assert.equal(await asUser(db, org, () => count('select * from public.events where id = $1', [ev])), 1);
    await db.query(`update public.profiles set role = 'student' where id = $1`, [org]);
    assert.equal(await asUser(db, org, () => count('select * from public.events where id = $1', [ev])), 0);
  });
});

test('a plain club member (not lead/coordinator) cannot manage club events', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer');
    await makeClubLead(db, org, ids.club, 'member');
    await asUser(db, org, () => expectFailFn(db, () => makeEvent(db, ids, org), RLS_VIOLATION));
  });
});

test('DSA sees submitted events but not drafts', async () => {
  await isolated(db, async () => {
    const org = await makeUser(db, 'organizer'), dsa = await makeUser(db, 'dsa');
    const draft = await makeEvent(db, ids, org);
    const sub = await makeEvent(db, ids, org, { ...SUBMITTED, venue_id: ids.venue2 });
    const rows = await asUser(db, dsa, async () => (await db.query('select id from public.events')).rows.map(r => r.id));
    assert.ok(rows.includes(sub) && !rows.includes(draft));
  });
});

// ========================================================== reference data
test('only admins can create venues/clubs or manage club membership', async () => {
  await isolated(db, async () => {
    const s = await makeUser(db), org = await makeUser(db, 'organizer'), admin = await makeUser(db, 'admin');
    await makeClubLead(db, org, ids.club);
    for (const who of [s, org]) {
      await asUser(db, who, async () => {
        await expectFail(db, `insert into public.venues (name, capacity) values ('Rogue Hall', 10)`, [], RLS_VIOLATION);
        await expectFail(db, `insert into public.club_members (club_id, user_id, membership_role) values ($1, $2, 'lead')`, [ids.club2, who], RLS_VIOLATION);
      });
    }
    await asUser(db, admin, () => db.query(`insert into public.venues (name, capacity) values ('New Hall', 10)`));
  });
});

// ============================================================= timetable
test('timetable: private to its owner, including from DSA and admin', async () => {
  await isolated(db, async () => {
    const a = await makeUser(db), b = await makeUser(db), dsa = await makeUser(db, 'dsa'), admin = await makeUser(db, 'admin');
    const ins = `insert into public.timetable_slots (student_id, term_id, subject_name, day_of_week, start_time, end_time) values ($1,$2,'Data Structures',1,'09:00','10:00') returning id`;
    const slotB = await asUser(db, b, async () => (await one(db, ins, [b, ids.term])).id);
    await asUser(db, a, async () => {
      await one(db, ins, [a, ids.term]);
      assert.equal(await count('select * from public.timetable_slots'), 1);
      await expectFail(db, ins, [b, ids.term], RLS_VIOLATION);                           // write into B's timetable
      assert.equal((await db.query(`update public.timetable_slots set subject_name='Hacked' where id=$1 returning id`, [slotB])).rows.length, 0);
      assert.equal((await db.query(`delete from public.timetable_slots where id=$1 returning id`, [slotB])).rows.length, 0);
    });
    for (const who of [dsa, admin]) assert.equal(await asUser(db, who, () => count('select * from public.timetable_slots')), 0);
  });
});

// ==================================================== registrations / OD
async function seedRegistrationAndOd(db) {
  const org = await makeUser(db, 'organizer'), a = await makeUser(db), b = await makeUser(db);
  await makeClubLead(db, org, ids.club);
  const ev = await makeEvent(db, ids, org, PUBLISHED);
  const ra = (await one(db, `insert into public.event_registrations (event_id, student_id, conflict_status) values ($1,$2,'partial_conflict') returning id`, [ev, a])).id;
  const rb = (await one(db, `insert into public.event_registrations (event_id, student_id, conflict_status) values ($1,$2,'full_conflict') returning id`, [ev, b])).id;
  await db.query(`insert into public.od_requests (registration_id, student_id, event_id, reason) values ($1,$2,$3,'Clashes with my DS lab')`, [ra, a, ev]);
  await db.query(`insert into public.od_requests (registration_id, student_id, event_id, reason) values ($1,$2,$3,'Clashes with my OS lecture')`, [rb, b, ev]);
  return { org, a, b, ev, ra, rb };
}

test('students see only their own registrations and OD requests', async () => {
  await isolated(db, async () => {
    const { a } = await seedRegistrationAndOd(db);
    await asUser(db, a, async () => {
      assert.equal(await count('select * from public.event_registrations'), 1);
      assert.equal(await count('select * from public.od_requests'), 1);
      assert.equal(await count('select * from public.od_requests where student_id <> $1', [a]), 0);
    });
  });
});

test('students cannot create registrations, OD requests or attendance directly', async () => {
  await isolated(db, async () => {
    const { a, ev, ra, org } = await seedRegistrationAndOd(db);
    const ev2 = await makeEvent(db, ids, org, { ...PUBLISHED, venue_id: ids.venue2 });
    await asUser(db, a, async () => {
      // Workflow tables are read-only for browser roles (no INSERT/UPDATE
      // grant); writes will only happen inside checked functions.
      await expectFail(db, `insert into public.event_registrations (event_id, student_id, conflict_status) values ($1,$2,'no_conflict')`, [ev2, a], PERMISSION_DENIED);
      await expectFail(db, `insert into public.attendance_records (registration_id, event_id, student_id, method, recorded_by) values ($1,$2,$3,'manual',$3)`, [ra, ev, a], PERMISSION_DENIED);
      await expectFail(db, `update public.od_requests set status = 'approved', reviewed_at = now()`, [], PERMISSION_DENIED);
    });
    assert.equal(await count(`select * from public.od_requests where status = 'approved'`), 0);
  });
});

test('OD reviewer (DSA) reads all OD requests; organizer reads only their events\'; nobody approves directly', async () => {
  await isolated(db, async () => {
    const { org } = await seedRegistrationAndOd(db);
    const dsa = await makeUser(db, 'dsa'), otherOrg = await makeUser(db, 'organizer');
    await makeClubLead(db, otherOrg, ids.club2);
    assert.equal(await asUser(db, dsa, () => count('select * from public.od_requests')), 2);
    assert.equal(await asUser(db, org, () => count('select * from public.od_requests')), 2);
    assert.equal(await asUser(db, otherOrg, () => count('select * from public.od_requests')), 0);
    // Even the reviewer cannot approve with a raw UPDATE (decisions go through the Stage 6 RPC):
    await asUser(db, dsa, () => expectFail(db, `update public.od_requests set status='approved', reviewed_at=now()`, [], PERMISSION_DENIED));
  });
});

test('OD reviewer roles are configurable via platform_settings', async () => {
  await isolated(db, async () => {
    await seedRegistrationAndOd(db);
    const dsa = await makeUser(db, 'dsa');
    await db.query(`update public.platform_settings set value = '["admin"]' where key = 'od_reviewer_roles'`);
    assert.equal(await asUser(db, dsa, () => count('select * from public.od_requests')), 0);
  });
});

// ======================================================= notifications
test('notifications: own inbox only; may only change is_read', async () => {
  await isolated(db, async () => {
    const a = await makeUser(db), b = await makeUser(db);
    for (const u of [a, b]) await db.query(`select public.notify($1,'test','Hello','World',null,null,'k1')`, [u]);
    await asUser(db, a, async () => {
      assert.equal(await count('select * from public.notifications'), 1);
      assert.equal((await db.query(`update public.notifications set is_read = true returning id`)).rows.length, 1);
      await expectFail(db, `update public.notifications set title = 'Forged'`, [], PERMISSION_DENIED);
      await expectFail(db, `insert into public.notifications (recipient_id, type, title, message, dedupe_key) values ($1,'x','Spam','Spam','s')`, [b], PERMISSION_DENIED);
    });
    assert.equal((await one(db, 'select is_read from public.notifications where recipient_id=$1', [b])).is_read, false);
  });
});

// ============================================================ audit log
test('audit log: admin can read but not alter; others cannot read', async () => {
  await isolated(db, async () => {
    const s = await makeUser(db), admin = await makeUser(db, 'admin');
    await asUser(db, admin, () => db.query(`select public.admin_set_user_role($1, 'organizer')`, [s]));
    assert.equal(await asUser(db, s, () => count('select * from public.audit_logs')), 0);
    await asUser(db, admin, async () => {
      assert.equal(await count('select * from public.audit_logs'), 1);
      await expectFail(db, `update public.audit_logs set action = 'role.hidden'`, [], PERMISSION_DENIED);
      await expectFail(db, `delete from public.audit_logs`, [], PERMISSION_DENIED);
      await expectFail(db, `insert into public.audit_logs (action, entity_type) values ('fake.entry','x')`, [], PERMISSION_DENIED);
    });
  });
});

// ======================================================== meta-checks
test('every SECURITY DEFINER function pins search_path', async () => {
  const { rows } = await db.query(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
  assert.deepEqual(rows, []);
});

test('every public table has RLS enabled and at least one policy', async () => {
  const { rows } = await db.query(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (not c.relrowsecurity or not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname))`);
  assert.deepEqual(rows, []);
});

// ======================================================== API grants (migration 7)
// Since Oct 2026 Supabase grants nothing automatically, so these guard
// against a future migration forgetting grants (app breaks) or granting
// too much (security hole).
test('grants: every table is reachable by logged-in users and by the server role', async () => {
  const { rows } = await db.query(`
    select c.relname,
           has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
           has_table_privilege('service_role',  c.oid, 'SELECT') as service_select
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'`);
  const missing = rows.filter(r => !r.auth_select || !r.service_select).map(r => r.relname);
  assert.deepEqual(missing, [], `tables missing SELECT grants: ${missing.join(', ')}`);
});

test('grants: visitors (anon) can only READ the public catalogue', async () => {
  const { rows } = await db.query(`
    select c.relname, p.priv
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) as p(priv)
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('anon', c.oid, p.priv)
    order by 1, 2`);
  assert.deepEqual(rows, ['categories', 'clubs', 'departments', 'event_audiences', 'events', 'venues']
    .map(relname => ({ relname, priv: 'SELECT' })));
});

test('grants: browser roles can never write workflow state directly', async () => {
  const forbidden = [
    ['event_registrations', 'INSERT'], ['event_registrations', 'UPDATE'],
    ['od_requests', 'INSERT'], ['od_requests', 'UPDATE'],
    ['attendance_records', 'INSERT'], ['attendance_sessions', 'INSERT'],
    ['audit_logs', 'INSERT'], ['audit_logs', 'UPDATE'], ['audit_logs', 'DELETE'],
    ['notifications', 'INSERT'], ['profiles', 'INSERT'],
  ];
  for (const [table, priv] of forbidden) {
    const { has } = await one(db, `select has_table_privilege('authenticated', $1, $2) as has`, [`public.${table}`, priv]);
    assert.equal(has, false, `authenticated must not have ${priv} on ${table}`);
  }
  for (const [table, column] of [['profiles', 'role'], ['profiles', 'is_active'], ['events', 'status'],
                                 ['events', 'reviewed_by'], ['events', 'published_at'], ['notifications', 'title']]) {
    const { has } = await one(db, `select has_column_privilege('authenticated', $1, $2, 'UPDATE') as has`, [`public.${table}`, column]);
    assert.equal(has, false, `authenticated must not UPDATE ${table}.${column}`);
  }
});
