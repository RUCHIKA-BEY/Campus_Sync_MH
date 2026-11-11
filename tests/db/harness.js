// Test harness: builds a fresh in-memory PostgreSQL (PGlite) and applies
// the Supabase shim, every migration in filename order, then seed.sql,
// exactly as Supabase would apply them.
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
export const migrationsDir = join(root, 'supabase', 'migrations');

export async function freshDb({ seed = true } = {}) {
  const db = await PGlite.create({ extensions: { btree_gist } });
  await db.exec(readFileSync(join(here, 'supabase_shim.sql'), 'utf8'));
  for (const file of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }
  if (seed) await db.exec(readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8'));
  return db;
}

// Run `fn` inside a transaction that is always rolled back, so every test
// starts from the same clean seeded state.
export async function isolated(db, fn) {
  await db.exec('begin');
  try { await fn(); } finally { await db.exec('rollback'); }
}

// Assert that a statement fails, and that it failed for the expected
// reason (constraint name or SQLSTATE code). A savepoint keeps the
// surrounding transaction usable after the error.
export async function expectFail(db, sql, params, expected) {
  return expectFailFn(db, () => db.query(sql, params), expected, sql);
}

// Same as expectFail, for a helper function such as makeEvent().
export async function expectFailFn(db, fn, expected, label = 'operation') {
  await db.exec('savepoint expect_fail');
  let error;
  try { await fn(); } catch (e) { error = e; }
  await db.exec('rollback to savepoint expect_fail');
  assert.ok(error, `Expected failure (${expected}) but it succeeded:\n${label}`);
  const haystack = `${error.constraint ?? ''} ${error.code ?? ''} ${error.message}`;
  assert.ok(haystack.includes(expected),
    `Expected "${expected}" but got: ${haystack}`);
}

export async function one(db, sql, params) {
  const { rows } = await db.query(sql, params);
  return rows[0];
}

// ---- fixtures -------------------------------------------------------
let counter = 0;
export async function makeUser(db, role = 'student', extra = {}) {
  counter += 1;
  const email = `user${counter}_${role}@test.campussync.dev`;
  // Like a real signup: insert into auth.users and let the
  // on_auth_user_created trigger build the profile.
  const meta = {
    full_name: extra.full_name ?? `Test ${role} ${counter}`,
    ...(role === 'student' ? { registration_number: `22TST${String(counter).padStart(4, '0')}` } : {}),
  };
  const { id } = await one(db,
    'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [email, meta]);
  // Elevated roles are set the way an operator would: directly, as the
  // database owner (the tests run as owner unless they switch role).
  if (role !== 'student') await db.query('update public.profiles set role = $2 where id = $1', [id, role]);
  return id;
}

// Make `userId` a lead of `clubId` (so an organizer can manage it).
export async function makeClubLead(db, userId, clubId, membershipRole = 'lead') {
  await db.query(
    `insert into public.club_members (club_id, user_id, membership_role) values ($1, $2, $3)`,
    [clubId, userId, membershipRole]);
}

// Run `fn` as a logged-in browser user (role `authenticated` + JWT sub),
// or as a logged-out visitor when userId is null. Must be inside isolated().
export async function asUser(db, userId, fn) {
  await db.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
  try { return await fn(); }
  finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  }
}

export async function refIds(db) {
  const club = await one(db, `select id from public.clubs where short_name = 'IE'`);
  const club2 = await one(db, `select id from public.clubs where short_name = 'CG'`);
  const venue = await one(db, `select id from public.venues where name = 'Tech Seminar Hall 1'`);
  const venue2 = await one(db, `select id from public.venues where name = 'Open Air Amphitheatre'`);
  const category = await one(db, `select id from public.categories where slug = 'technology'`);
  const term = await one(db, `select id from public.academic_terms where name = '2026-27 Odd Semester'`);
  return { club: club.id, club2: club2.id, venue: venue.id, venue2: venue2.id,
           category: category.id, term: term.id };
}

// Insert an event with sensible defaults; override any column via `cols`.
export async function makeEvent(db, ids, createdBy, cols = {}) {
  const base = {
    club_id: ids.club, created_by: createdBy, title: 'Test Event Title',
    description: 'A sufficiently long description.', category_id: ids.category,
    event_type: 'workshop', venue_id: ids.venue,
    starts_at: '2026-12-01 10:00+05:30', ends_at: '2026-12-01 12:00+05:30',
    registration_opens_at: '2026-11-15 09:00+05:30',
    registration_closes_at: '2026-11-30 23:59+05:30',
    capacity: 50, ...cols,
  };
  // status is omitted for drafts so the column default applies (browser
  // users are not even allowed to write the status column).
  const keys = Object.keys(base);
  const sql = `insert into public.events (${keys.join(', ')})
               values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id`;
  return (await one(db, sql, keys.map(k => base[k]))).id;
}
