import { describe, expect, it } from 'vitest';
import { campusDate, campusWeekday, clockLabel, isoFromIstInput, istInputFromIso, toMinutes } from './time';

describe('time helpers', () => {
  it('toMinutes handles HH:MM and HH:MM:SS', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('13:05:00')).toBe(785);
  });
  it('clockLabel formats 12-hour time', () => {
    expect(clockLabel('00:00:00')).toBe('12:00 am');
    expect(clockLabel('12:15')).toBe('12:15 pm');
    expect(clockLabel('17:45:00')).toBe('5:45 pm');
  });
  it('round-trips a datetime-local value through IST', () => {
    const iso = isoFromIstInput('2026-12-10T10:00');
    expect(iso).toBe('2026-12-10T10:00:00+05:30');
    expect(istInputFromIso(iso)).toBe('2026-12-10T10:00');
  });
  it('converts a UTC instant from the database into campus time', () =>
    expect(istInputFromIso('2026-12-10T04:30:00Z')).toBe('2026-12-10T10:00'));
  it('rejects malformed input', () => expect(() => isoFromIstInput('10/12/2026')).toThrow());
  it('weekday and date follow IST, not the viewer timezone', () => {
    const lateSundayUtc = new Date('2026-11-29T20:00:00Z'); // 01:30 Monday in IST
    expect(campusWeekday(lateSundayUtc)).toBe(1);
    expect(campusDate(lateSundayUtc)).toBe('2026-11-30');
  });
});
