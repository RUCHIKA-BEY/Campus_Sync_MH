// Organizer data. RLS lets an organizer see and edit ONLY events of clubs
// they actively lead/coordinate, and column GRANTs stop them from ever
// writing status/review/publication fields (no self-approval).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, supabase } from './supabase';
import { useAuth } from '../auth/AuthProvider';

export type EventStatus = 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'approved' | 'rejected' | 'published' | 'completed' | 'cancelled';
export type EventType = 'workshop' | 'hackathon' | 'seminar' | 'competition' | 'cultural' | 'sports' | 'guest_lecture' | 'club_activity' | 'other';
export type EventScope = 'club' | 'department' | 'university';

export const STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under review', changes_requested: 'Changes requested',
  approved: 'Approved', rejected: 'Rejected', published: 'Published', completed: 'Completed', cancelled: 'Cancelled',
};
export const EVENT_TYPES: Array<[EventType, string]> = [
  ['workshop', 'Workshop'], ['hackathon', 'Hackathon'], ['seminar', 'Seminar'], ['competition', 'Competition'],
  ['cultural', 'Cultural'], ['sports', 'Sports'], ['guest_lecture', 'Guest lecture'], ['club_activity', 'Club activity'], ['other', 'Other'],
];

export interface ManagedClub { id: string; name: string; short_name: string; membership_role: 'lead' | 'coordinator' }
export interface Venue { id: string; name: string; building: string | null; capacity: number }

export interface OrgEvent {
  id: string; club_id: string; title: string; description: string; category_id: string; event_type: EventType; scope: EventScope;
  venue_id: string | null; starts_at: string; ends_at: string; registration_opens_at: string; registration_closes_at: string;
  capacity: number; od_eligible: boolean; status: EventStatus; review_note: string | null;
  venue: { name: string } | null; category: { name: string } | null;
}

/** Writable columns only: exactly what the database GRANTs to organizers. */
export type DraftInput = Pick<OrgEvent, 'club_id' | 'title' | 'description' | 'category_id' | 'event_type' | 'scope' | 'venue_id' |
  'starts_at' | 'ends_at' | 'registration_opens_at' | 'registration_closes_at' | 'capacity' | 'od_eligible'>;

export function useManagedClubs() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['managed-clubs', session?.user.id],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<ManagedClub[]> => {
      const { data, error } = await requireSupabase().from('club_members')
        .select('membership_role, club:clubs(id, name, short_name)')
        .eq('user_id', session!.user.id).eq('membership_status', 'active').in('membership_role', ['lead', 'coordinator']);
      if (error) throw error;
      return (data as unknown as Array<{ membership_role: 'lead' | 'coordinator'; club: { id: string; name: string; short_name: string } | null }>)
        .filter(r => r.club).map(r => ({ ...r.club!, membership_role: r.membership_role }));
    },
  });
}

export function useVenues() {
  return useQuery({
    queryKey: ['venues'],
    enabled: Boolean(supabase),
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Venue[]> => {
      const { data, error } = await requireSupabase().from('venues').select('id, name, building, capacity').eq('is_active', true).order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useClubEvents(clubIds: string[]) {
  return useQuery({
    queryKey: ['club-events', [...clubIds].sort().join(',')],
    enabled: Boolean(supabase && clubIds.length),
    queryFn: async (): Promise<OrgEvent[]> => {
      const { data, error } = await requireSupabase().from('events')
        .select('id, club_id, title, description, category_id, event_type, scope, venue_id, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity, od_eligible, status, review_note, venue:venues(name), category:categories(name)')
        .in('club_id', clubIds).order('starts_at');
      if (error) throw error;
      return data as unknown as OrgEvent[];
    },
  });
}

export function useSaveDraft() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: DraftInput }) => {
      const db = requireSupabase();
      // status is never sent: new rows default to 'draft', and organizers have
      // no privilege on that column at all.
      const { error } = id
        ? await db.from('events').update(input).eq('id', id)
        : await db.from('events').insert({ ...input, created_by: session!.user.id });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['club-events'] }),
  });
}

export function useDeleteDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await requireSupabase().from('events').delete().eq('id', id).select('id');
      if (error) throw error;
      // RLS hides non-draft rows from DELETE, which looks like "0 rows" rather than an error.
      if (!data?.length) throw new Error('Only drafts can be deleted.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['club-events'] }),
  });
}

/** Client-side mirror of the events CHECK constraints (the DB re-checks). */
export function validateDraft(d: DraftInput, venueCapacity?: number): string | null {
  if (d.title.trim().length < 5) return 'Title must be at least 5 characters.';
  if (d.description.trim().length < 10) return 'Description must be at least 10 characters.';
  const s = Date.parse(d.starts_at), e = Date.parse(d.ends_at), o = Date.parse(d.registration_opens_at), c = Date.parse(d.registration_closes_at);
  if ([s, e, o, c].some(Number.isNaN)) return 'Fill in all dates and times.';
  if (e <= s) return 'The event must end after it starts.';
  if (!(o < c && c <= s)) return 'Registration must open before it closes, and close before the event starts.';
  if (!Number.isInteger(d.capacity) || d.capacity < 1) return 'Capacity must be a whole number of at least 1.';
  if (venueCapacity !== undefined && d.capacity > venueCapacity) return `Capacity is larger than the venue holds (${venueCapacity}).`;
  return null;
}
