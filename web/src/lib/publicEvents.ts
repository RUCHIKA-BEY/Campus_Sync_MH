// Real, PUBLISHED events from the database, mapped to the CampusEvent shape
// the Discover UI already uses. Falls back to labelled sample events only
// when the database has none yet (or no backend is connected).
import { useQuery } from '@tanstack/react-query';
import { requireSupabase, supabase } from './supabase';
import { CATEGORY_IMAGE, DEFAULT_EVENT_IMAGE, SAMPLE_EVENTS, type CampusEvent } from './events';

export interface EventRow {
  id: string; title: string; description: string; status: 'published' | 'completed' | 'cancelled';
  scope: CampusEvent['scope']; starts_at: string; ends_at: string; registration_opens_at: string; registration_closes_at: string;
  capacity: number; od_eligible: boolean; poster_url: string | null; cancellation_reason: string | null;
  club: { name: string } | null; venue: { name: string } | null; category: { name: string; slug: string } | null;
}

export const EVENT_COLUMNS = 'id, title, description, status, scope, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity, od_eligible, poster_url, cancellation_reason, club:clubs(name), venue:venues(name), category:categories(name, slug)';

export function toCampusEvent(r: EventRow): CampusEvent {
  const slug = r.category?.slug ?? 'other';
  return {
    id: r.id, title: r.title, description: r.description,
    club: r.club?.name ?? 'Campus club', categorySlug: slug, categoryName: r.category?.name ?? 'Event',
    venue: r.venue?.name ?? 'Venue to be announced',
    image: r.poster_url || CATEGORY_IMAGE[slug] || DEFAULT_EVENT_IMAGE,
    startsAt: r.starts_at, endsAt: r.ends_at,
    registrationOpensAt: r.registration_opens_at, registrationClosesAt: r.registration_closes_at,
    capacity: r.capacity, registeredCount: null, // filled in by withSeats() from get_event_seats
    odEligible: r.od_eligible,
    featured: r.scope === 'university', // transparent rule: university-wide events are featured
    scope: r.scope, lifecycle: r.status, cancellationReason: r.cancellation_reason, isSample: false,
  };
}

/** Adds live seat counts (numbers only, via a database function that
 *  never reveals WHO registered). If the call fails, counts stay unknown. */
async function withSeats(events: CampusEvent[]): Promise<CampusEvent[]> {
  if (!events.length) return events;
  const { data, error } = await requireSupabase().rpc('get_event_seats', { p_event_ids: events.map(e => e.id) });
  if (error) { console.error('CampusSync: seat counts unavailable', error); return events; }
  const taken = new Map((data as Array<{ event_id: string; registered: number }>).map(r => [r.event_id, r.registered]));
  return events.map(e => (taken.has(e.id) ? { ...e, registeredCount: taken.get(e.id)! } : e));
}

/** Public catalogue. The explicit status filter matters: a signed-in
 *  organizer/DSA can SEE more rows through RLS, but Discover must only
 *  ever show public events. */
export function usePublicEvents() {
  return useQuery({
    queryKey: ['public-events'],
    enabled: Boolean(supabase),
    queryFn: async (): Promise<CampusEvent[]> => {
      const { data, error } = await requireSupabase().from('events').select(EVENT_COLUMNS)
        .in('status', ['published', 'completed', 'cancelled']).not('published_at', 'is', null)
        .order('starts_at').limit(200);
      if (error) throw error;
      return withSeats((data as unknown as EventRow[]).map(toCampusEvent));
    },
  });
}

export interface EventFeed { events: CampusEvent[]; isSample: boolean; isLoading: boolean; error: unknown }

/** Real events if any are published; otherwise labelled samples. */
export function useEventFeed(): EventFeed {
  const q = usePublicEvents();
  if (!supabase) return { events: SAMPLE_EVENTS, isSample: true, isLoading: false, error: null };
  if (q.isPending) return { events: [], isSample: false, isLoading: true, error: null };
  if (q.isError || !q.data.length) return { events: SAMPLE_EVENTS, isSample: true, isLoading: false, error: q.error };
  return { events: q.data, isSample: false, isLoading: false, error: null };
}

/** One event by id: sample ids resolve locally, everything else from the DB. */
export function useEventById(id: string | undefined) {
  const sample = SAMPLE_EVENTS.find(e => e.id === id);
  const q = useQuery({
    queryKey: ['public-event', id],
    enabled: Boolean(supabase && id && !sample),
    queryFn: async (): Promise<CampusEvent | null> => {
      const { data, error } = await requireSupabase().from('events').select(EVENT_COLUMNS)
        .eq('id', id!).in('status', ['published', 'completed', 'cancelled']).not('published_at', 'is', null).maybeSingle();
      if (error) throw error;
      return data ? (await withSeats([toCampusEvent(data as unknown as EventRow)]))[0]! : null;
    },
  });
  if (sample) return { event: sample, isLoading: false };
  return { event: q.data ?? null, isLoading: q.isPending && Boolean(supabase && id) };
}
