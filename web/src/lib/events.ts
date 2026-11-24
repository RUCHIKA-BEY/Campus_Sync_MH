// Event model, SAMPLE event data, and the pure logic used by Discover.
//
// IMPORTANT: the events below are SAMPLE data, clearly labelled in the UI.
// Real events come from the `events` table once the Stage 5 (proposal and
// approval) and Stage 6 (registration) workflows exist. Everything else
// here (status, filters, formatting) is real logic that will run
// unchanged on database rows.

export const CAMPUS_TZ = 'Asia/Kolkata';

export interface CampusEvent {
  id: string;
  title: string;
  description: string;
  club: string;
  categorySlug: string;
  categoryName: string;
  venue: string;
  image: string;
  startsAt: string;            // ISO with offset
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  capacity: number;
  /** null = not known yet (real events until Stage 6 adds registrations). */
  registeredCount: number | null;
  odEligible: boolean;
  featured: boolean;
  scope: 'club' | 'department' | 'university';
  /** Lifecycle of a PUBLIC event (drafts/proposals are never shown here). */
  lifecycle: 'published' | 'completed' | 'cancelled';
  cancellationReason?: string | null;
  isSample: boolean;
}

export const CATEGORY_IMAGE: Record<string, string> = {
  hackathons: '/assets/event_hackathon_1793037313961.jpg',
  research: '/assets/event_hackathon_1793037313961.jpg',
  technology: '/assets/event_robotics_1793037314638.jpg',
  music: '/assets/event_arts_music_1793037314690.jpg',
  'arts-culture': '/assets/event_arts_music_1793037314690.jpg',
};
export const DEFAULT_EVENT_IMAGE = '/assets/hero_campus_life_1793037312856.jpg';

const IMG = {
  hackathon: '/assets/event_hackathon_1793037313961.jpg',
  arts: '/assets/event_arts_music_1793037314690.jpg',
  robotics: '/assets/event_robotics_1793037314638.jpg',
  campus: '/assets/hero_campus_life_1793037312856.jpg',
};

type SampleSeed = Omit<CampusEvent, 'isSample' | 'lifecycle'>;

const SAMPLE_SEED: SampleSeed[] = [
  {
    id: 'hackgrid', title: 'HackGrid 2026: 24h Campus Hackathon',
    description: 'Build boldly, collaborate with peers, and turn your sharpest ideas into a campus-ready prototype. Mentors, midnight snacks and a demo stage.',
    club: 'IEEE Student Branch', categorySlug: 'hackathons', categoryName: 'Hackathons',
    venue: 'Innovation & Incubation Lab', image: IMG.hackathon,
    startsAt: '2026-12-12T10:00:00+05:30', endsAt: '2026-12-13T10:00:00+05:30',
    registrationOpensAt: '2026-11-15T09:00:00+05:30', registrationClosesAt: '2026-12-10T23:59:00+05:30',
    capacity: 150, registeredCount: 112, odEligible: true, featured: true, scope: 'university',
  },
  {
    id: 'acoustic', title: 'Acoustic Sunset: Winter Indie Session',
    description: 'A warm evening of intimate live music, student artists, and a campus sunset worth slowing down for.',
    club: 'Campus Cultural Guild', categorySlug: 'music', categoryName: 'Music',
    venue: 'Open Air Amphitheatre', image: IMG.arts,
    startsAt: '2026-12-04T17:30:00+05:30', endsAt: '2026-12-04T20:00:00+05:30',
    registrationOpensAt: '2026-11-18T09:00:00+05:30', registrationClosesAt: '2026-11-25T23:59:00+05:30',
    capacity: 150, registeredCount: 118, odEligible: false, featured: true, scope: 'club',
  },
  {
    id: 'rover', title: 'Autonomous Rover & LiDAR Build Weekend',
    description: 'Build, sense, and navigate. A hands-on bootcamp for students who want to take robotics beyond the classroom.',
    club: 'Build Club', categorySlug: 'technology', categoryName: 'Technology',
    venue: 'Makerspace 1', image: IMG.robotics,
    startsAt: '2026-12-08T09:00:00+05:30', endsAt: '2026-12-08T16:30:00+05:30',
    registrationOpensAt: '2026-11-10T09:00:00+05:30', registrationClosesAt: '2026-12-05T23:59:00+05:30',
    capacity: 40, registeredCount: 40, odEligible: true, featured: false, scope: 'department',
  },
  {
    id: 'theatre', title: 'Inter-Collegiate Theatre & Mono-Act Festival',
    description: 'Stories, stagecraft, and student voices from across the region in one expressive evening.',
    club: 'Campus Cultural Guild', categorySlug: 'arts-culture', categoryName: 'Arts & Culture',
    venue: 'Auditorium', image: IMG.arts,
    startsAt: '2026-12-19T16:00:00+05:30', endsAt: '2026-12-19T20:30:00+05:30',
    registrationOpensAt: '2026-11-12T09:00:00+05:30', registrationClosesAt: '2026-12-17T23:59:00+05:30',
    capacity: 600, registeredCount: 254, odEligible: false, featured: true, scope: 'university',
  },
  {
    id: 'venture', title: 'VentureForge: Angel Pitch & Term Sheet Clinic',
    description: 'Bring your early-stage idea, pressure-test the story, and learn the language of a strong founder–investor conversation.',
    club: 'E-Cell Entrepreneurship Hub', categorySlug: 'entrepreneurship', categoryName: 'Entrepreneurship',
    venue: 'Seminar Hall 1', image: IMG.campus,
    startsAt: '2026-12-15T14:00:00+05:30', endsAt: '2026-12-15T17:00:00+05:30',
    registrationOpensAt: '2026-11-28T09:00:00+05:30', registrationClosesAt: '2026-12-13T23:59:00+05:30',
    capacity: 75, registeredCount: 0, odEligible: false, featured: false, scope: 'club',
  },
  {
    id: 'quantum', title: 'NextGen Quantum Computing & Cryptography Symposium',
    description: 'A focused symposium for curious minds exploring the next chapter of computing, security, and applied research.',
    club: 'IEEE Student Branch', categorySlug: 'research', categoryName: 'Research',
    venue: 'Seminar Hall 1', image: IMG.hackathon,
    startsAt: '2027-01-14T10:00:00+05:30', endsAt: '2027-01-14T15:30:00+05:30',
    registrationOpensAt: '2026-11-18T09:00:00+05:30', registrationClosesAt: '2027-01-10T23:59:00+05:30',
    capacity: 120, registeredCount: 41, odEligible: true, featured: false, scope: 'department',
  },
  {
    id: 'emcee', title: 'Emcee Bootcamp: Hosting Live Campus Events',
    description: 'Voice, presence and timing. Practise anchoring a live event with feedback from senior hosts.',
    club: 'Speaker and Anchors club', categorySlug: 'community', categoryName: 'Community',
    venue: 'Seminar Hall 1', image: IMG.campus,
    startsAt: '2026-12-03T15:00:00+05:30', endsAt: '2026-12-03T17:00:00+05:30',
    registrationOpensAt: '2026-11-15T09:00:00+05:30', registrationClosesAt: '2026-12-02T23:59:00+05:30',
    capacity: 60, registeredCount: 22, odEligible: false, featured: false, scope: 'club',
  },
  {
    id: 'oss-fireside', title: 'Fireside: Your First Open-Source Contribution',
    description: 'A friendly walkthrough from finding an issue to getting your first pull request merged.',
    club: 'Women in Tech Campus', categorySlug: 'technology', categoryName: 'Technology',
    venue: 'Makerspace 2', image: IMG.robotics,
    startsAt: '2026-11-20T16:00:00+05:30', endsAt: '2026-11-20T18:00:00+05:30',
    registrationOpensAt: '2026-11-05T09:00:00+05:30', registrationClosesAt: '2026-11-19T23:59:00+05:30',
    capacity: 50, registeredCount: 47, odEligible: false, featured: false, scope: 'club',
  },
];

export const SAMPLE_EVENTS: CampusEvent[] = SAMPLE_SEED.map(e => ({ ...e, isSample: true, lifecycle: 'published' }));

// ---------------------------------------------------------------------
// Registration status (computed, never stored)
// ---------------------------------------------------------------------
export type RegistrationStatus = 'open' | 'closing-soon' | 'full' | 'not-open' | 'closed' | 'in-progress' | 'ended' | 'cancelled';

const CLOSING_SOON_MS = 48 * 60 * 60 * 1000;

export function registrationStatus(e: CampusEvent, now: Date): RegistrationStatus {
  const t = now.getTime();
  if (e.lifecycle === 'cancelled') return 'cancelled';
  if (t >= Date.parse(e.endsAt) || e.lifecycle === 'completed') return 'ended';
  if (t >= Date.parse(e.startsAt)) return 'in-progress';
  if (t < Date.parse(e.registrationOpensAt)) return 'not-open';
  if (t >= Date.parse(e.registrationClosesAt)) return 'closed';
  if (e.registeredCount !== null && e.registeredCount >= e.capacity) return 'full';
  if (Date.parse(e.registrationClosesAt) - t <= CLOSING_SOON_MS) return 'closing-soon';
  return 'open';
}

export const canRegister = (s: RegistrationStatus) => s === 'open' || s === 'closing-soon';
export const seatsLeft = (e: CampusEvent): number | null => e.registeredCount === null ? null : Math.max(0, e.capacity - e.registeredCount);

// ---------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------
export type When = 'upcoming' | 'week' | 'month' | 'past';

export interface EventFilters {
  query: string;
  category: string; // slug or 'all'
  club: string;     // club name or 'all'
  when: When;
  savedOnly: boolean;
}

export const DEFAULT_FILTERS: EventFilters = { query: '', category: 'all', club: 'all', when: 'upcoming', savedOnly: false };

const DAY = 24 * 60 * 60 * 1000;

export function filterEvents(events: CampusEvent[], f: EventFilters, now: Date, savedIds: ReadonlySet<string>): CampusEvent[] {
  const t = now.getTime();
  const q = f.query.trim().toLowerCase();
  const result = events.filter(e => {
    const start = Date.parse(e.startsAt);
    const end = Date.parse(e.endsAt);
    if (f.when === 'past' ? end > t : end <= t) return false;   // past vs. not-yet-finished
    if (f.when === 'week' && start > t + 7 * DAY) return false;
    if (f.when === 'month' && start > t + 30 * DAY) return false;
    if (f.category !== 'all' && e.categorySlug !== f.category) return false;
    if (f.club !== 'all' && e.club !== f.club) return false;
    if (f.savedOnly && !savedIds.has(e.id)) return false;
    if (q && !`${e.title} ${e.club} ${e.venue} ${e.categoryName}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const dir = f.when === 'past' ? -1 : 1;
  return result.sort((a, b) => dir * (Date.parse(a.startsAt) - Date.parse(b.startsAt)));
}

/** Transparent "for you" rule: upcoming events whose category you picked. */
export function matchInterests(events: CampusEvent[], interestSlugs: ReadonlySet<string>, now: Date): CampusEvent[] {
  if (!interestSlugs.size) return [];
  return events
    .filter(e => interestSlugs.has(e.categorySlug) && Date.parse(e.endsAt) > now.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

// ---------------------------------------------------------------------
// Formatting (always in campus time, whatever the viewer's timezone)
// ---------------------------------------------------------------------
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { timeZone: CAMPUS_TZ, ...opts });
const dayFmt = fmt({ day: 'numeric' });
const monthFmt = fmt({ month: 'short' });
const weekdayFmt = fmt({ weekday: 'short' });
const timeFmt = fmt({ hour: 'numeric', minute: '2-digit', hour12: true });
const longDateFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDateFmt = fmt({ day: 'numeric', month: 'short' });
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: CAMPUS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export function dateParts(iso: string) {
  const d = new Date(iso);
  return { day: dayFmt.format(d), month: monthFmt.format(d).toUpperCase(), weekday: weekdayFmt.format(d) };
}

export function timeRange(e: CampusEvent): string {
  const s = new Date(e.startsAt), en = new Date(e.endsAt);
  const sameDay = ymdFmt.format(s) === ymdFmt.format(en);
  return sameDay
    ? `${timeFmt.format(s)} – ${timeFmt.format(en)}`
    : `${timeFmt.format(s)}, ${shortDateFmt.format(s)} – ${timeFmt.format(en)}, ${shortDateFmt.format(en)}`;
}

export const longDate = (iso: string) => longDateFmt.format(new Date(iso));
export const shortDate = (iso: string) => shortDateFmt.format(new Date(iso));
export const shortDateTime = (iso: string) => `${shortDateFmt.format(new Date(iso))}, ${timeFmt.format(new Date(iso))}`;

export function statusLabel(s: RegistrationStatus, e: CampusEvent): string {
  switch (s) {
    case 'open': { const left = seatsLeft(e); return left === null ? 'Registration open' : `${left} seats left`; }
    case 'closing-soon': return `Closes ${shortDateTime(e.registrationClosesAt)}`;
    case 'full': return 'Event full';
    case 'not-open': return `Opens ${shortDate(e.registrationOpensAt)}`;
    case 'closed': return 'Registration closed';
    case 'in-progress': return 'Happening now';
    case 'ended': return 'Event ended';
    case 'cancelled': return 'Cancelled';
  }
}
