import { describe, expect, it } from 'vitest';
import { PERIODS, buildRows, periodSpan, yFor } from './periods';
import { toMinutes } from './time';

describe('bell schedule', () => {
  it('runs 8:50 to 16:15 with no gaps or overlaps', () => {
    expect(PERIODS[0]!.start).toBe('08:50');
    expect(PERIODS.at(-1)!.end).toBe('16:15');
    for (let i = 1; i < PERIODS.length; i++) expect(PERIODS[i]!.start).toBe(PERIODS[i - 1]!.end);
  });

  it('has eight ordinary periods; period 5 is not assumed to be lunch', () => {
    expect(PERIODS.filter(p => p.kind === 'class').map(p => p.no)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(PERIODS.find(p => p.no === '5')).toMatchObject({ start: '12:35', end: '13:25', kind: 'class' });
    expect(periodSpan('12:35', '13:25')).toBe('Period 5');
  });

  it('names period spans', () => {
    expect(periodSpan('08:50:00', '09:45:00')).toBe('Period 1');
    expect(periodSpan('10:50', '12:35')).toBe('Periods 3–4');
    expect(periodSpan('14:30', '16:15')).toBe('Periods 7–8');
    expect(periodSpan('09:00', '10:00')).toBeNull();
  });

  it('lays rows out top to bottom, breaks at least 22px', () => {
    const rows = buildRows([], 1.15);
    expect(rows).toHaveLength(PERIODS.length);
    expect(rows.find(r => r.kind === 'break')!.height).toBe(22);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.top).toBe(rows[i - 1]!.top + rows[i - 1]!.height);
  });

  it('places a class exactly on its period rows', () => {
    const rows = buildRows([], 1.15);
    const p3 = rows.find(r => r.label === '3')!, p4 = rows.find(r => r.label === '4')!;
    expect(yFor(rows, toMinutes('10:50'))).toBe(p3.top);
    expect(yFor(rows, toMinutes('12:35'))).toBe(p4.top + p4.height);
  });

  it('adds extra rows for classes outside the bell schedule', () => {
    const rows = buildRows([{ start_time: '07:30', end_time: '08:50' }, { start_time: '16:15', end_time: '17:30' }], 1.15);
    expect(rows[0]!.kind).toBe('extra');
    expect(rows[0]!.start).toBe(toMinutes('07:30'));
    expect(rows.at(-1)!.end).toBe(toMinutes('17:30'));
  });
});
