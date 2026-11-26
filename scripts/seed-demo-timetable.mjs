// Fills the demo STUDENT's timetable with class 3CSE02's real week
// (Presidency University, 2026-27 odd semester; labs for batch B1),
// so event registration can be tested against real class clashes.
//
//   npm run demo:timetable                              (odd semester)
//   npm run demo:timetable -- "2026-27 Even Semester"  (another term)
//
// Runs on YOUR machine only, with the SECRET key from .env (it bypasses
// RLS; timetables are otherwise private to their owner). It REPLACES the
// demo student's classes in that term; nobody else's data is touched.
// Run `npm run demo:users` first so the demo student exists.
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
const STUDENT_EMAIL = 'student.demo@campussync.test';
const TERMS = process.argv.slice(2).length ? process.argv.slice(2) : ['2026-27 Odd Semester'];

function die(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) die('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env (see .env.example).');
if (SUPABASE_SECRET_KEY.startsWith('sb_publishable_')) die('SUPABASE_SECRET_KEY is a publishable key. Use the sb_secret_… key.');

// Subject names by course code. Edit freely; unknown codes show the code itself.
const NAMES = {
  MAT2303: 'Mathematics',
  CSE2255: 'Data Structures',
  CSE2258: 'Web Technologies',
  APT4002: 'Aptitude',
};
const name = (code, lab) => `${NAMES[code] ?? code}${lab ? ' Lab' : ''}`;

// Bell schedule: period → [start, end].
const P = {
  1: ['08:50', '09:45'], 2: ['09:45', '10:40'], 3: ['10:50', '11:45'], 4: ['11:45', '12:35'],
  6: ['13:25', '14:20'], 7: ['14:30', '15:25'], 8: ['15:25', '16:15'],
};
// [day (1 = Mon), first period, last period, course code, room, lab?]
const WEEK = [
  [1, 1, 1, 'MAT2303', 'PV04'], [1, 2, 2, 'CSE2255', 'PV04'], [1, 3, 4, 'CSE2254', 'LFL01', true],
  [2, 1, 1, 'CSE2257', 'PV04'], [2, 2, 2, 'CSE2255', 'PV04'], [2, 3, 4, 'CSE2252', 'DSL03', true],
  [2, 6, 6, 'CSE2251', 'PV04'], [2, 7, 7, 'CSE2258', 'PV04'], [2, 8, 8, 'CSE2253', 'PV04'],
  [3, 1, 2, 'APT4002', 'PV04'], [3, 3, 3, 'CSE2257', 'PV04'], [3, 4, 4, 'CSE2255', 'PV04'], [3, 6, 6, 'MAT2303', 'PV04'],
  [4, 1, 1, 'MAT2303', 'PV04'], [4, 2, 2, 'CSE2253', 'PV04'], [4, 3, 3, 'CSE2251', 'PV04'], [4, 4, 4, 'CSE2258', 'PV04'],
  [4, 7, 8, 'CSE2256', 'LGL01', true],
  [5, 1, 1, 'CSE2257', 'PV04'], [5, 2, 2, 'CSE2251', 'PV04'], [5, 3, 4, 'CSE2259', 'LFL03', true],
  [5, 6, 6, 'CSE2253', 'PV04'], [5, 7, 7, 'CSE2258', 'PV04'], [5, 8, 8, 'MAT2303', 'PV04'],
];

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const { data: student, error: sErr } = await admin.from('profiles').select('id, role').ilike('email', STUDENT_EMAIL).maybeSingle();
  if (sErr) throw sErr;
  if (!student) die(`${STUDENT_EMAIL} not found. Run npm run demo:users first.`);
  if (student.role !== 'student') die(`${STUDENT_EMAIL} is not a student (role: ${student.role}).`);

  for (const termName of TERMS) {
    const { data: term, error: tErr } = await admin.from('academic_terms').select('id').eq('name', termName).maybeSingle();
    if (tErr) throw tErr;
    if (!term) die(`Term "${termName}" not found.`);

    const rows = WEEK.map(([day, from, to, code, room, lab]) => ({
      student_id: student.id, term_id: term.id, day_of_week: day,
      start_time: P[from][0], end_time: P[to][1],
      subject_name: name(code, lab), course_code: code, room,
    }));
    const { error: dErr } = await admin.from('timetable_slots').delete().eq('student_id', student.id).eq('term_id', term.id);
    if (dErr) throw dErr;
    const { error: iErr } = await admin.from('timetable_slots').insert(rows);
    if (iErr) throw iErr;
    console.log(`  ✓ ${termName}: ${rows.length} classes for ${STUDENT_EMAIL}`);
  }
  console.log('\nDone. Sign in as the demo student and open My timetable.');
}

main().catch(err => die(err.message || String(err)));
