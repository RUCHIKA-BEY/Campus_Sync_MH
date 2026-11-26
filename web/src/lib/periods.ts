// The university's bell schedule (Presidency University, 2026-27).
// The timetable grid is drawn in these rows instead of clock hours.
import { toMinutes } from './time';

export interface Period {
  /** "1"…"8" for teaching periods; null for breaks. */
  no: string | null;
  label: string;
  start: string;
  end: string;
  kind: 'class' | 'break' | 'lunch';
}

export const PERIODS: readonly Period[] = [
  { no: '1', label: 'Period 1', start: '08:50', end: '09:45', kind: 'class' },
  { no: '2', label: 'Period 2', start: '09:45', end: '10:40', kind: 'class' },
  { no: null, label: 'Break', start: '10:40', end: '10:50', kind: 'break' },
  { no: '3', label: 'Period 3', start: '10:50', end: '11:45', kind: 'class' },
  { no: '4', label: 'Period 4', start: '11:45', end: '12:35', kind: 'class' },
  { no: '5', label: 'Lunch break', start: '12:35', end: '13:25', kind: 'lunch' },
  { no: '6', label: 'Period 6', start: '13:25', end: '14:20', kind: 'class' },
  { no: null, label: 'Break', start: '14:20', end: '14:30', kind: 'break' },
  { no: '7', label: 'Period 7', start: '14:30', end: '15:25', kind: 'class' },
  { no: '8', label: 'Period 8', start: '15:25', end: '16:15', kind: 'class' },
];

/** Periods a class can be booked into (the lunch slot is selectable too, for the odd class held then). */
export const BOOKABLE = PERIODS.filter(p => p.kind !== 'break');

export interface Row { label: string; sub: string; start: number; end: number; top: number; height: number; kind: Period['kind'] | 'extra' }

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/**
 * Grid rows: the bell schedule, plus extra hourly rows if a class starts
 * before period 1 or ends after period 8. Row height follows its length,
 * with a minimum so the 10-minute breaks stay readable.
 */
export function buildRows(slots: Array<{ start_time: string; end_time: string }>, pxPerMin: number, minRow = 22): Row[] {
  const dayStart = toMinutes(PERIODS[0]!.start), dayEnd = toMinutes(PERIODS[PERIODS.length - 1]!.end);
  const earliest = Math.min(dayStart, ...slots.map(s => toMinutes(s.start_time)));
  const latest = Math.max(dayEnd, ...slots.map(s => toMinutes(s.end_time)));
  const spans: Array<Omit<Row, 'top' | 'height'>> = [];
  for (let t = Math.floor(earliest / 60) * 60; t < dayStart; ) {
    const end = Math.min(t + 60, dayStart);
    const start = Math.max(t, earliest);
    if (end > start) spans.push({ label: 'Early', sub: `${hhmm(start)}`, start, end, kind: 'extra' });
    t = end;
  }
  for (const p of PERIODS) {
    spans.push({ label: p.kind === 'class' ? p.no! : p.kind === 'lunch' ? 'Lunch' : 'Break', sub: `${p.start}–${p.end}`, start: toMinutes(p.start), end: toMinutes(p.end), kind: p.kind });
  }
  for (let t = dayEnd; t < latest; ) {
    const end = Math.min((Math.floor(t / 60) + 1) * 60, latest);
    spans.push({ label: 'Late', sub: hhmm(t), start: t, end, kind: 'extra' });
    t = end;
  }
  let top = 0;
  return spans.map(s => {
    const height = Math.max(minRow, Math.round((s.end - s.start) * pxPerMin));
    const row = { ...s, top, height };
    top += height;
    return row;
  });
}

/** Minutes since midnight → pixel offset within the rows (piecewise, so short breaks don't distort classes). */
export function yFor(rows: Row[], minutes: number): number {
  if (!rows.length) return 0;
  if (minutes <= rows[0]!.start) return 0;
  for (const r of rows) {
    if (minutes <= r.end) return r.top + ((minutes - r.start) / (r.end - r.start)) * r.height;
  }
  const last = rows[rows.length - 1]!;
  return last.top + last.height;
}

/** "Periods 3–4", "Period 6", or null when the class doesn't line up with the bell schedule. */
export function periodSpan(start: string, end: string): string | null {
  const s = BOOKABLE.find(p => p.start === start.slice(0, 5));
  const e = BOOKABLE.find(p => p.end === end.slice(0, 5));
  if (!s || !e || s.kind !== 'class' || e.kind !== 'class') return null;
  return s === e ? `Period ${s.no}` : `Periods ${s.no}–${e.no}`;
}
