// SAMPLE timetable, used ONLY when no backend is connected (sample mode),
// so the clash preview on sample events has something real-shaped to check.
// It is class 3CSE02's week (2026-27 odd semester, lab batch B1), the same
// week scripts/seed-demo-timetable.mjs gives the demo student. It is never
// shown as anyone's academic record: every result from it is labelled
// "Demo preview".
import type { EngineSlot, EngineTerm } from './conflict';
import { PERIODS } from './periods';

// Same dates as supabase/seed.sql.
export const SAMPLE_TERMS: EngineTerm[] = [
  { id: 'sample-odd', starts_on: '2026-08-01', ends_on: '2026-12-25' },
  { id: 'sample-even', starts_on: '2027-01-08', ends_on: '2027-05-31' },
];

const NAMES: Record<string, string> = {
  MAT2303: 'Mathematics', CSE2255: 'Data Structures', CSE2258: 'Web Technologies', APT4002: 'Aptitude',
};
const period = (no: number) => PERIODS.find(p => p.no === String(no))!;

// [day (1 = Mon), first period, last period, course code, room, lab?]
const WEEK: Array<[number, number, number, string, string, boolean?]> = [
  [1, 1, 1, 'MAT2303', 'PV04'], [1, 2, 2, 'CSE2255', 'PV04'], [1, 3, 4, 'CSE2254', 'LFL01', true],
  [2, 1, 1, 'CSE2257', 'PV04'], [2, 2, 2, 'CSE2255', 'PV04'], [2, 3, 4, 'CSE2252', 'DSL03', true],
  [2, 6, 6, 'CSE2251', 'PV04'], [2, 7, 7, 'CSE2258', 'PV04'], [2, 8, 8, 'CSE2253', 'PV04'],
  [3, 1, 2, 'APT4002', 'PV04'], [3, 3, 3, 'CSE2257', 'PV04'], [3, 4, 4, 'CSE2255', 'PV04'], [3, 6, 6, 'MAT2303', 'PV04'],
  [4, 1, 1, 'MAT2303', 'PV04'], [4, 2, 2, 'CSE2253', 'PV04'], [4, 3, 3, 'CSE2251', 'PV04'], [4, 4, 4, 'CSE2258', 'PV04'],
  [4, 7, 8, 'CSE2256', 'LGL01', true],
  [5, 1, 1, 'CSE2257', 'PV04'], [5, 2, 2, 'CSE2251', 'PV04'], [5, 3, 4, 'CSE2259', 'LFL03', true],
  [5, 6, 6, 'CSE2253', 'PV04'], [5, 7, 7, 'CSE2258', 'PV04'], [5, 8, 8, 'MAT2303', 'PV04'],
];

export const SAMPLE_SLOTS: EngineSlot[] = WEEK.map(([day, from, to, code, room, lab]) => ({
  term_id: 'sample-odd', day_of_week: day, start_time: period(from).start, end_time: period(to).end,
  subject_name: `${NAMES[code] ?? code}${lab ? ' Lab' : ''}`, course_code: code, room,
}));

/** D8 as seeded in supabase/seed data: full clashes may still register (with a warning). */
export const SAMPLE_ALLOW_FULL_CONFLICT = true;
