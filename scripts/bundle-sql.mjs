// Joins every migration (in order) + optionally seed.sql into ONE file you
// can paste into the Supabase SQL Editor, wrapped in a transaction so it
// applies completely or not at all.
//
//   npm run db:bundle              → supabase/.bundle/setup_all.sql (migrations + seed)
//   npm run db:bundle -- --no-seed → migrations only (for production)
//
// The migrations folder stays the single source of truth; the bundle is a
// generated, git-ignored convenience copy. Re-generate after any change.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');
const withSeed = !process.argv.includes('--no-seed');

const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
const parts = [
  '-- =====================================================================',
  '-- CampusSync — GENERATED setup bundle. Do not edit; edit supabase/migrations/',
  `-- Generated ${new Date().toISOString()} from ${files.length} migrations${withSeed ? ' + seed.sql' : ''}.`,
  '-- Paste into Supabase → SQL Editor → Run. Runs in ONE transaction:',
  '-- if anything fails, nothing is applied and you can safely retry.',
  '-- Run it on an EMPTY project only (migrations are not re-runnable).',
  '-- ⚠ The SQL Editor does NOT record Supabase migration history. Afterwards',
  '-- run `supabase migration repair --status applied --linked <versions>` for',
  `-- every migration below (${files.map(f => f.slice(0, 14)).join(' ')}).`,
  '-- See docs/MIGRATIONS.md. Prefer `npm run db:push` when the CLI is available.',
  '-- =====================================================================',
  'begin;',
  '',
];
for (const f of files) {
  parts.push(`-- ───────────── migration: ${f} ─────────────`, readFileSync(join(migrationsDir, f), 'utf8'), '');
}
if (withSeed) {
  parts.push('-- ───────────── seed.sql (development data) ─────────────', readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8'), '');
}
parts.push('commit;', '');

const outDir = join(root, 'supabase', '.bundle');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, withSeed ? 'setup_all.sql' : 'setup_migrations_only.sql');
writeFileSync(out, parts.join('\n'));
console.log(`Wrote ${out}\n(${files.length} migrations${withSeed ? ' + seed' : ''})`);
