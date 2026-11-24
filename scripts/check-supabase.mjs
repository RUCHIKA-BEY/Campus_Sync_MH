// Checks a real Supabase project from the OUTSIDE, exactly as an
// anonymous website visitor would, using only the PUBLIC key.
//
//   npm run check:supabase
//
// It reads public/js/config.js (what the website really uses), falling
// back to SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY in .env.
// It creates no accounts and changes no data (the one write attempt is
// expected to be REFUSED by RLS).
import { createClient } from '@supabase/supabase-js';
import * as siteConfig from '../public/js/config.js';

const url = siteConfig.SUPABASE_URL || process.env.SUPABASE_URL;
const key = siteConfig.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

function die(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }
if (!url || !key) die('No Supabase URL/publishable key found in public/js/config.js or .env.');

// Safety: a secret key must NEVER be in the public config.
function looksSecret(k) {
  if (k.startsWith('sb_secret_')) return true;
  if (k.startsWith('eyJ')) { // legacy JWT-style key: inspect its role claim
    try { return JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role === 'service_role'; }
    catch { return false; }
  }
  return false;
}
if (looksSecret(key)) {
  die('DANGER: the key in public/js/config.js is a SECRET/service-role key. Remove it now, ' +
      'use the publishable key instead, and rotate the secret key in the Supabase dashboard.');
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
let failures = 0;
const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push(['✅', name, detail ?? '']);
  } catch (err) {
    failures += 1;
    results.push(['❌', name, err.message]);
  }
}
const readRows = async table => {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    const hint = error.code === '42501' ? ' (missing GRANT: has migration 20261124000100 been pushed?)' : '';
    throw new Error(`${error.message}${hint}`);
  }
  return data;
};
const expectRows = async (table, n) => {
  const data = await readRows(table);
  if (data.length !== n) throw new Error(`expected ${n} rows, got ${data.length}`);
  return `${data.length} rows`;
};
// Seed data is editable, so only require that rows exist.
const expectSomeRows = async table => {
  const data = await readRows(table);
  if (!data.length) throw new Error('no rows (did seed.sql run?)');
  return `${data.length} rows`;
};
// Private tables: protected if the visitor gets NO GRANT (42501) or 0 rows.
const expectPrivate = async table => {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    if (error.code === '42501') return 'refused: no grant for visitors';
    throw new Error(`unexpected error: ${error.message}`);
  }
  if (data.length) throw new Error(`${data.length} private rows visible to a visitor!`);
  return '0 rows visible';
};

console.log(`Checking ${new URL(url).host} as an anonymous visitor…\n`);

await check('Project reachable & Auth settings readable', async () => {
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  if (!res.ok) throw new Error(`HTTP ${res.status}. Check the URL and key.`);
  const s = await res.json();
  if (!s.external?.email) throw new Error('Email sign-in is DISABLED (Authentication → Sign In / Providers → Email)');
  if (s.disable_signup) throw new Error('New sign-ups are DISABLED in Auth settings');
  return `email sign-in on · confirm email ${s.mailer_autoconfirm ? 'OFF (auto-confirm)' : 'ON'}`;
});
await check('Public reference data: categories', () => expectRows('categories', 8));
await check('Public reference data: departments', () => expectSomeRows('departments'));
await check('Public reference data: venues', () => expectSomeRows('venues'));
await check('Public reference data: clubs', () => expectSomeRows('clubs'));
await check('Visitor cannot read profiles', () => expectPrivate('profiles'));
await check('Visitor cannot read academic terms', () => expectPrivate('academic_terms'));
await check('Visitor cannot read audit log', () => expectPrivate('audit_logs'));
await check('Visitor sees no unpublished events (RLS)', async () => {
  const { data, error } = await supabase.from('events').select('id, status');
  if (error) throw error;
  const leaked = data.filter(e => !['published', 'completed', 'cancelled'].includes(e.status));
  if (leaked.length) throw new Error(`${leaked.length} non-public events visible!`);
  return `${data.length} public events`;
});
// A refusal only counts if the DATABASE said no (42501 = insufficient
// privilege / RLS). A network failure must not look like a pass.
function assertRefusedByDatabase(error, what) {
  if (!error) throw new Error(`${what} SUCCEEDED for an anonymous visitor!`);
  const refused = error.code === '42501' || /row-level security|permission denied/i.test(error.message);
  if (!refused) throw new Error(`unexpected error (not a permission refusal): ${error.message}`);
  return `refused: ${error.message}`;
}
await check('Visitor cannot create a venue (RLS refuses INSERT)', async () => {
  const { error } = await supabase.from('venues').insert({ name: `RLS probe ${Date.now()}`, capacity: 1 });
  return assertRefusedByDatabase(error, 'INSERT into venues');
});
await check('Visitor cannot call admin_set_user_role', async () => {
  const { error } = await supabase.rpc('admin_set_user_role', {
    p_user_id: '00000000-0000-0000-0000-000000000000', p_role: 'admin' });
  return assertRefusedByDatabase(error, 'admin_set_user_role');
});

for (const [ok, name, detail] of results) console.log(`${ok} ${name}${detail ? `  (${detail})` : ''}`);
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed. The project is set up and locked down correctly.');
process.exit(failures ? 1 : 0);
