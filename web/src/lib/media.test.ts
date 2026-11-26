import { describe, expect, it } from 'vitest';
import { checkImageFile, mediaPathFromUrl, MAX_IMAGE_BYTES } from './media';
import { validateDraft, type DraftInput } from './organizer';

const file = (type: string, bytes: number) => new File([new Uint8Array(bytes)], 'x', { type });

describe('event images', () => {
  it('accepts JPG, PNG and WebP up to 2 MB', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp']) expect(checkImageFile(file(t, 1000))).toBeNull();
    expect(checkImageFile(file('image/png', MAX_IMAGE_BYTES))).toBeNull();
  });
  it('rejects other types and files over 2 MB', () => {
    expect(checkImageFile(file('image/gif', 10))).toMatch(/JPG, PNG or WebP/);
    expect(checkImageFile(file('application/pdf', 10))).toMatch(/JPG, PNG or WebP/);
    expect(checkImageFile(file('image/jpeg', MAX_IMAGE_BYTES + 1))).toMatch(/limit is 2 MB/);
  });
  it('finds the storage path only for our own bucket URLs', () => {
    expect(mediaPathFromUrl('https://abc.supabase.co/storage/v1/object/public/event-media/e1/poster-1.webp')).toBe('e1/poster-1.webp');
    expect(mediaPathFromUrl('https://elsewhere.test/poster.webp')).toBeNull();
    expect(mediaPathFromUrl(null)).toBeNull();
  });
});

describe('venue requests in drafts', () => {
  const base: DraftInput = {
    club_id: 'c', title: 'Annual Cultural Fest', description: 'A big evening for everyone.', category_id: 'k',
    event_type: 'cultural', scope: 'university', venue_id: null,
    requested_venue_name: null, requested_venue_building: null, requested_venue_capacity: null,
    starts_at: '2027-02-10T18:00:00+05:30', ends_at: '2027-02-10T22:00:00+05:30',
    registration_opens_at: '2027-01-20T09:00:00+05:30', registration_closes_at: '2027-02-09T23:00:00+05:30',
    capacity: 500, od_eligible: false,
  };
  it('needs a name and a capacity for the requested venue', () => {
    expect(validateDraft({ ...base, requested_venue_name: ' ', requested_venue_capacity: 800 })).toMatch(/Name the venue/);
    expect(validateDraft({ ...base, requested_venue_name: 'Main Ground', requested_venue_capacity: 0 })).toMatch(/capacity/);
  });
  it('checks event capacity against the requested venue', () => {
    expect(validateDraft({ ...base, requested_venue_name: 'Main Ground', requested_venue_capacity: 300 })).toMatch(/larger than the venue holds \(300\)/);
    expect(validateDraft({ ...base, requested_venue_name: 'Main Ground', requested_venue_capacity: 800 })).toBeNull();
  });
});
