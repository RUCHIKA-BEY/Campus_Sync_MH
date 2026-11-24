import { describe, expect, it } from 'vitest';
import {
  SAMPLE_EVENTS, DEFAULT_FILTERS, registrationStatus, canRegister, filterEvents,
  matchInterests, timeRange, dateParts, type CampusEvent,
} from './events';

const base: CampusEvent = {
  ...SAMPLE_EVENTS[0]!,
  startsAt: '2026-12-10T10:00:00+05:30', endsAt: '2026-12-10T12:00:00+05:30',
  registrationOpensAt: '2026-11-20T09:00:00+05:30', registrationClosesAt: '2026-12-09T23:59:00+05:30',
  capacity: 10, registeredCount: 3,
};
const at = (iso: string) => new Date(iso);

describe('registrationStatus', () => {
  it('is not-open before the window', () => expect(registrationStatus(base, at('2026-11-19T12:00:00+05:30'))).toBe('not-open'));
  it('is open inside the window', () => expect(registrationStatus(base, at('2026-11-25T12:00:00+05:30'))).toBe('open'));
  it('is closing-soon within 48h of the deadline', () => expect(registrationStatus(base, at('2026-12-08T12:00:00+05:30'))).toBe('closing-soon'));
  it('is full when capacity is reached', () =>
    expect(registrationStatus({ ...base, registeredCount: 10 }, at('2026-11-25T12:00:00+05:30'))).toBe('full'));
  it('is closed after the deadline, even with seats', () => expect(registrationStatus(base, at('2026-12-10T08:00:00+05:30'))).toBe('closed'));
  it('is in-progress during the event', () => expect(registrationStatus(base, at('2026-12-10T11:00:00+05:30'))).toBe('in-progress'));
  it('is ended at the exact end instant (half-open interval)', () => expect(registrationStatus(base, at('2026-12-10T12:00:00+05:30'))).toBe('ended'));
  it('only open/closing-soon allow registering', () => {
    expect(['open', 'closing-soon', 'full', 'not-open', 'closed', 'in-progress', 'ended'].map(s => canRegister(s as never)))
      .toEqual([true, true, false, false, false, false, false]);
  });
  it('compares instants, not local clock text (UTC input)', () =>
    expect(registrationStatus(base, at('2026-12-10T05:00:00Z'))).toBe('in-progress')); // 10:30 IST
});

describe('filterEvents', () => {
  const now = at('2026-11-24T12:00:00+05:30');
  const none = new Set<string>();
  it('upcoming hides finished events and sorts by start', () => {
    const r = filterEvents(SAMPLE_EVENTS, DEFAULT_FILTERS, now, none);
    expect(r.find(e => e.id === 'oss-fireside')).toBeUndefined();
    expect(r.map(e => Date.parse(e.startsAt))).toEqual([...r.map(e => Date.parse(e.startsAt))].sort((a, b) => a - b));
  });
  it('past shows only finished events', () =>
    expect(filterEvents(SAMPLE_EVENTS, { ...DEFAULT_FILTERS, when: 'past' }, now, none).map(e => e.id)).toEqual(['oss-fireside']));
  it('week limits to the next 7 days', () =>
    filterEvents(SAMPLE_EVENTS, { ...DEFAULT_FILTERS, when: 'week' }, now, none)
      .forEach(e => expect(Date.parse(e.startsAt) - now.getTime()).toBeLessThanOrEqual(7 * 864e5)));
  it('search matches title, club, venue and category, case-insensitively', () => {
    expect(filterEvents(SAMPLE_EVENTS, { ...DEFAULT_FILTERS, query: 'IEEE' }, now, none).map(e => e.id)).toEqual(['hackgrid', 'quantum']);
    expect(filterEvents(SAMPLE_EVENTS, { ...DEFAULT_FILTERS, query: 'makerspace 1' }, now, none).map(e => e.id)).toEqual(['rover']);
  });
  it('category, club and saved filters combine', () => {
    const r = filterEvents(SAMPLE_EVENTS, { ...DEFAULT_FILTERS, category: 'arts-culture', club: 'Campus Cultural Guild', savedOnly: true }, now, new Set(['theatre', 'acoustic']));
    expect(r.map(e => e.id)).toEqual(['theatre']);
  });
});

describe('matchInterests', () => {
  const now = at('2026-11-24T12:00:00+05:30');
  it('returns nothing without interests (no fake recommendations)', () => expect(matchInterests(SAMPLE_EVENTS, new Set(), now)).toEqual([]));
  it('returns upcoming events in the chosen categories only', () =>
    expect(matchInterests(SAMPLE_EVENTS, new Set(['technology']), now).map(e => e.id)).toEqual(['rover']));
});

describe('formatting uses campus time (Asia/Kolkata)', () => {
  it('shows an overnight event with both dates', () => expect(timeRange(SAMPLE_EVENTS[0]!)).toMatch(/12 Dec.*13 Dec/));
  it('renders date parts in IST even for a UTC instant near midnight', () =>
    expect(dateParts('2026-12-11T19:00:00Z')).toMatchObject({ day: '12', month: 'DEC' })); // 00:30 IST on 12 Dec
});
