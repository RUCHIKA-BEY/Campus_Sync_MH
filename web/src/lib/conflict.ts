// Timetable clash check for SAMPLE MODE ONLY (no backend connected).
//
// With a backend, every answer comes from the database function
// _timetable_conflict (via check_timetable_conflict / check_timetable_window)
// and this file is not used. Without one there is no database to ask, so
// this is a line-by-line port of that function, run on the labelled sample
// timetable. tests/fixtures/schedule-cases.json is checked against BOTH
// implementations, so they cannot drift apart.
//
// Rule: a class clashes when event_start < class_end AND event_end > class_start
// (half-open intervals: touching end-to-start is not a clash). Weekly classes
// are placed on each real campus day (Asia/Kolkata, fixed UTC+05:30) the event
// covers, using the term that contains that day.
import type { ConflictResult, ConflictItem } from './registration';
import { isLunch } from './periods';
import { toMinutes } from './time';

export interface EngineTerm { id: string; starts_on: string; ends_on: string }
export interface EngineSlot {
  term_id: string; subject_name: string; course_code: string | null; room: string | null;
  day_of_week: number; start_time: string; end_time: string;
}

const MIN = 60_000;
const DAY = 86_400_000;
const IST = 330 * MIN; // India has no daylight saving, so the offset is exact.

const campusDay = (ms: number) => Math.floor((ms + IST) / DAY);          // days since 1970-01-01, campus time
const dayStart = (day: number) => day * DAY - IST;                        // instant of 00:00 campus time
const dayDate = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const isoWeekday = (day: number) => ((new Date(day * DAY).getUTCDay() + 6) % 7) + 1;
const iso = (ms: number) => new Date(ms).toISOString();
const mins = (ms: number) => Math.round(ms / MIN);

export function computeConflict(
  event: { startsAt: string; endsAt: string; odEligible: boolean },
  terms: EngineTerm[], slots: EngineSlot[],
): ConflictResult {
  const s = Date.parse(event.startsAt), e = Date.parse(event.endsAt);
  if (!(e > s)) throw new Error('The event must end after it starts.');
  const eventMinutes = mins(e - s);
  let complete = true, total = 0;
  const conflicts: ConflictItem[] = [];

  for (let d = campusDay(s), last = campusDay(e - 1); d <= last; d++) {
    const winS = Math.max(s, dayStart(d)), winE = Math.min(e, dayStart(d + 1));
    const date = dayDate(d);
    const term = terms.find(t => t.starts_on <= date && date <= t.ends_on);
    const mine = term ? slots.filter(x => x.term_id === term.id) : [];
    if (!term || !mine.length) complete = false;   // no term, or nothing entered for it

    mine
      .filter(x => x.day_of_week === isoWeekday(d) && !isLunch(x.subject_name))
      .map(x => ({ x, cS: dayStart(d) + toMinutes(x.start_time) * MIN, cE: dayStart(d) + toMinutes(x.end_time) * MIN }))
      .filter(({ cS, cE }) => winS < cE && winE > cS)
      .sort((a, b) => a.cS - b.cS)
      .forEach(({ x, cS, cE }) => {
        const oS = Math.max(winS, cS), oE = Math.min(winE, cE);
        total += mins(oE - oS);
        conflicts.push({
          subject: x.subject_name, course_code: x.course_code, room: x.room, date,
          class_start: iso(cS), class_end: iso(cE), overlap_start: iso(oS), overlap_end: iso(oE), overlap_minutes: mins(oE - oS),
        });
      });
  }

  return {
    status: total >= eventMinutes ? 'full_conflict' : total > 0 ? 'partial_conflict' : complete ? 'no_conflict' : 'timetable_not_configured',
    event_minutes: eventMinutes,
    overlap_minutes: Math.min(total, eventMinutes),
    free_minutes: Math.max(eventMinutes - total, 0),
    timetable_complete: complete,
    od_eligible: event.odEligible,
    conflicts,
  };
}
