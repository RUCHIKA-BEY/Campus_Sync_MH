// The browser's sample-mode clash engine must give exactly the database's
// answers: the same fixture runs against _timetable_conflict in
// tests/db/schedule_preview.test.js.
import { describe, expect, it } from 'vitest';
import fixture from '../../../tests/fixtures/schedule-cases.json';
import { computeConflict, type EngineSlot, type EngineTerm } from './conflict';
import { SAMPLE_SLOTS, SAMPLE_TERMS } from './sampleTimetable';
import { deriveState, scheduleMode, unavailableMessage } from './schedule';
import type { CampusEvent } from './events';
import { SAMPLE_EVENTS } from './events';

const terms: EngineTerm[] = fixture.terms.map(t => ({ id: t.name, starts_on: t.starts_on, ends_on: t.ends_on }));
const slots: EngineSlot[] = fixture.slots.map(x => ({
  term_id: x.term, day_of_week: x.day, start_time: x.start, end_time: x.end, subject_name: x.subject, course_code: null, room: null,
}));
const ev = (startsAt: string, endsAt: string, odEligible = false) => ({ startsAt, endsAt, odEligible });

describe('shared clash cases (same as the database)', () => {
  for (const c of fixture.cases) {
    it(c.name, () => {
      const r = computeConflict(ev(c.starts_at, c.ends_at), terms, 'empty_timetable' in c && c.empty_timetable ? [] : slots);
      expect(r.status).toBe(c.status);
      expect(r.event_minutes).toBe(c.event_minutes);
      expect(r.overlap_minutes).toBe(c.overlap_minutes);
      expect(r.conflicts.map(x => x.subject)).toEqual(c.subjects);
      expect(r.conflicts.map(x => x.overlap_minutes)).toEqual(c.overlaps);
    });
  }
});

describe('engine details', () => {
  it('reports exact IST class and overlap instants', () => {
    const r = computeConflict(ev('2026-12-15T14:00:00+05:30', '2026-12-15T17:00:00+05:30'), terms, slots);
    expect(r.conflicts[0]).toMatchObject({
      date: '2026-12-15',
      class_start: '2026-12-15T07:55:00.000Z', class_end: '2026-12-15T08:50:00.000Z',     // 13:25–14:20 IST
      overlap_start: '2026-12-15T08:30:00.000Z', overlap_end: '2026-12-15T08:50:00.000Z', // 14:00–14:20 IST
    });
    expect(r.free_minutes).toBe(55);
  });

  it('splits an event that crosses midnight by campus day', () => {
    // Mon 23:00 → Tue 09:00 IST: only Tuesday's 08:50 class (10 min) clashes.
    const r = computeConflict(ev('2026-12-14T23:00:00+05:30', '2026-12-15T09:00:00+05:30'), terms, slots);
    expect(r.conflicts.map(c => [c.date, c.subject, c.overlap_minutes])).toEqual([['2026-12-15', 'CSE2257', 10]]);
  });

  it('passes the event’s OD flag through and refuses an empty event', () => {
    expect(computeConflict(ev('2026-12-15T14:00:00+05:30', '2026-12-15T17:00:00+05:30', true), terms, slots).od_eligible).toBe(true);
    expect(() => computeConflict(ev('2026-12-15T14:00:00+05:30', '2026-12-15T14:00:00+05:30'), terms, slots)).toThrow();
  });
});

describe('sample mode: the VentureForge sample event against the sample 3CSE02 week', () => {
  it('clashes with the three Tuesday afternoon classes', () => {
    const vf = SAMPLE_EVENTS.find(e => e.id === 'venture')!;
    const r = computeConflict(vf, SAMPLE_TERMS, SAMPLE_SLOTS);
    expect(r.status).toBe('partial_conflict');
    expect(r.overlap_minutes).toBe(125);
    expect(r.conflicts.map(c => c.subject)).toEqual(['CSE2251', 'Web Technologies', 'CSE2253']);
  });
});

describe('which check runs (never "no conflict" by default)', () => {
  const now = new Date('2026-11-28T12:00:00+05:30');
  const sample = SAMPLE_EVENTS.find(e => e.id === 'venture')!;
  const real: CampusEvent = { ...sample, id: 'b9c5c0a2-0000-4000-8000-000000000001', isSample: false };
  const base = { connected: true, ready: true, signedIn: true, role: 'student', now };

  it('connected: real event → database, sample event → preview of your real timetable', () => {
    expect(scheduleMode(real, base)).toBe('database');
    expect(scheduleMode(sample, base)).toBe('preview');
  });
  it('no backend → labelled sample timetable', () => {
    expect(scheduleMode(sample, { ...base, connected: false, signedIn: false, role: undefined })).toBe('sample');
  });
  it('waits for auth and profile instead of guessing', () => {
    expect(scheduleMode(real, { ...base, ready: false })).toBe('checking');
    expect(scheduleMode(real, { ...base, role: undefined })).toBe('checking');
  });
  it('signed out, non-students, and finished or cancelled events', () => {
    expect(scheduleMode(real, { ...base, signedIn: false, role: undefined })).toBe('signed-out');
    expect(scheduleMode(real, { ...base, role: 'organizer' })).toBe('not-student');
    expect(scheduleMode(real, { ...base, now: new Date('2026-12-16T00:00:00+05:30') })).toBe('not-applicable');
    expect(scheduleMode({ ...real, lifecycle: 'cancelled' }, base)).toBe('not-applicable');
  });
});

describe('loading and failures are never shown as "no conflict"', () => {
  const idle = { isError: false, isPending: false, isFetching: false, data: undefined, error: null };
  const ok = computeConflict(ev('2026-12-16T14:30:00+05:30', '2026-12-16T16:15:00+05:30'), terms, slots);

  it('still loading → checking', () => {
    expect(deriveState('database', { ...idle, isPending: true, isFetching: true }, null)).toEqual({ kind: 'checking' });
  });
  it('network failure → unavailable', () => {
    const s = deriveState('database', { ...idle, isError: true, error: new Error('Failed to fetch') }, null);
    expect(s.kind).toBe('unavailable');
  });
  it('preview function missing on the server (migration 14 not applied) → unavailable with a clear reason', () => {
    const err = { code: 'PGRST202', message: 'Could not find the function public.check_timetable_window' };
    const s = deriveState('preview', { ...idle, isError: true, error: err }, null);
    expect(s).toEqual({ kind: 'unavailable', message: unavailableMessage(err) });
    expect(unavailableMessage(err)).toMatch(/isn’t enabled on the server/);
  });
  it('retrying after a failure → checking, not the old error and not "free"', () => {
    expect(deriveState('database', { ...idle, isError: true, isFetching: true, error: new Error('x') }, null)).toEqual({ kind: 'checking' });
  });
  it('an answer → result, labelled with where it came from', () => {
    expect(deriveState('database', { ...idle, data: ok }, null)).toEqual({ kind: 'result', result: ok, source: 'database' });
    expect(deriveState('preview', { ...idle, data: ok }, null)).toMatchObject({ source: 'preview' });
    expect(deriveState('sample', idle, ok)).toMatchObject({ source: 'sample' });
  });
});
