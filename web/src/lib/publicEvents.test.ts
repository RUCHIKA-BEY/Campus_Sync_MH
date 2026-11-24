import { describe, expect, it } from 'vitest';
import { toCampusEvent } from './publicEvents';
import { registrationStatus, statusLabel, canRegister } from './events';

const row = {
  id: 'e1', title: 'Real Hack Night', description: 'An approved, published event.', status: 'published' as const,
  scope: 'university' as const, starts_at: '2027-01-20T10:00:00+05:30', ends_at: '2027-01-20T18:00:00+05:30',
  registration_opens_at: '2027-01-01T09:00:00+05:30', registration_closes_at: '2027-01-18T23:59:00+05:30',
  capacity: 80, od_eligible: true, poster_url: null, cancellation_reason: null,
  club: { name: 'Build Club' }, venue: { name: 'Makerspace 1' }, category: { name: 'Hackathons', slug: 'hackathons' },
};
const during = new Date('2027-01-10T12:00:00+05:30');

describe('toCampusEvent (database row → UI model)', () => {
  it('maps names, flags it as real, and features university-wide events', () => {
    const e = toCampusEvent(row);
    expect(e).toMatchObject({ club: 'Build Club', venue: 'Makerspace 1', categorySlug: 'hackathons', isSample: false, featured: true, lifecycle: 'published' });
    expect(e.image).toContain('hackathon');
  });
  it('never invents a seat count before registration exists', () => {
    const e = toCampusEvent(row);
    expect(e.registeredCount).toBeNull();
    expect(registrationStatus(e, during)).toBe('open');
    expect(statusLabel('open', e)).toBe('Registration open');
  });
  it('a cancelled event is shown as cancelled and cannot be registered for', () => {
    const e = toCampusEvent({ ...row, status: 'cancelled', cancellation_reason: 'Venue flooded after rain.' });
    const s = registrationStatus(e, during);
    expect(s).toBe('cancelled');
    expect(canRegister(s)).toBe(false);
  });
  it('a completed event counts as ended even if the clock says otherwise', () =>
    expect(registrationStatus(toCampusEvent({ ...row, status: 'completed' }), during)).toBe('ended'));
  it('falls back to defaults for missing relations', () => {
    const e = toCampusEvent({ ...row, club: null, venue: null, category: null });
    expect(e).toMatchObject({ club: 'Campus club', venue: 'Venue to be announced', categoryName: 'Event' });
  });
});
