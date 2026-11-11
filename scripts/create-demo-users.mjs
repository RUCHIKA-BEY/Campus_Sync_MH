// Creates (or refreshes) the four demo accounts used in evaluations.
//
//   npm run demo:users
//
// Runs on YOUR machine only. It uses the SECRET key from .env, which
// bypasses RLS, so it must never be copied into public/ or committed.
// Safe to re-run: existing demo users get their password and role reset.
//
// Why a script instead of SQL in seed.sql? A real login needs Supabase
// Auth to hash the password and create identity records. The Admin API
// does that properly; hand-written INSERTs into auth.users are fragile.
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY, DEMO_PASSWORD } = process.env;

function die(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) die('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env (see .env.example).');
if (SUPABASE_SECRET_KEY.startsWith('sb_publishable_')) die('SUPABASE_SECRET_KEY is a publishable key. Use the secret key from Project Settings → API Keys.');
if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 12 || !/[A-Za-z]/.test(DEMO_PASSWORD) || !/[0-9]/.test(DEMO_PASSWORD)) {
  die('Set DEMO_PASSWORD in .env: at least 12 characters with letters and numbers.');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Fictional people matching the existing UI personas.
const DEMO_USERS = [
  { email: 'student.demo@campussync.test', role: 'student',
    meta: { full_name: 'Priya Sharma', registration_number: '22CS1042', department_code: 'CSE', academic_year: '3' } },
  { email: 'organizer.demo@campussync.test', role: 'organizer',
    meta: { full_name: 'Arjun Patel', department_code: 'ECE' }, leadOf: 'IEEE Student Branch' },
  { email: 'dsa.demo@campussync.test', role: 'dsa',
    meta: { full_name: 'Dr. V. Ramanathan' } },
  { email: 'admin.demo@campussync.test', role: 'admin',
    meta: { full_name: 'Campus Administrator' } },
];

async function findUserIdByEmail(email) {
  const { data, error } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function ensureUser({ email, meta }) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: meta,
  });
  if (!error) return { id: data.user.id, created: true };
  if (error.code !== 'email_exists' && !/already been registered/i.test(error.message)) throw error;
  const id = await findUserIdByEmail(email);
  if (!id) throw new Error(`${email} exists in Auth but has no profile row. Did migrations run before the user was created?`);
  const { error: updErr } = await admin.auth.admin.updateUserById(id, { password: DEMO_PASSWORD, user_metadata: meta });
  if (updErr) throw updErr;
  return { id, created: false };
}

async function main() {
  console.log(`Creating demo accounts in ${new URL(SUPABASE_URL).host} …\n`);
  for (const user of DEMO_USERS) {
    const { id, created } = await ensureUser(user);

    // Roles are set here with the secret key (an operator action). In the
    // app, only an admin can change roles, via admin_set_user_role().
    const { error: roleErr } = await admin.from('profiles').update({ role: user.role }).eq('id', id);
    if (roleErr) throw roleErr;

    if (user.leadOf) {
      const { data: club, error: clubErr } = await admin.from('clubs').select('id').eq('name', user.leadOf).single();
      if (clubErr) throw new Error(`Club "${user.leadOf}" not found. Run supabase/seed.sql first.`);
      const { error: memErr } = await admin.from('club_members').upsert(
        { club_id: club.id, user_id: id, membership_role: 'lead', membership_status: 'active' },
        { onConflict: 'club_id,user_id' });
      if (memErr) throw memErr;
    }
    console.log(`  ${created ? '✓ created ' : '↻ updated '} ${user.role.padEnd(9)} ${user.email}${user.leadOf ? `  (lead of ${user.leadOf})` : ''}`);
  }
  console.log('\nDone. Sign in with these emails and the DEMO_PASSWORD from your .env file.');
}

main().catch(err => die(err.message || String(err)));
