// Registration, conflict checks, registrants and scheduling warnings.
// All decisions are made by database functions (migration 9); the UI only
// displays their answers.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, supabase } from './supabase';
import { useAuth } from '../auth/AuthProvider';
import { toCampusEvent, EVENT_COLUMNS, type EventRow } from './publicEvents';
import type { CampusEvent } from './events';

export type ConflictStatus = 'no_conflict' | 'partial_conflict' | 'full_conflict' | 'timetable_not_configured';

export interface ConflictItem {
  subject: string; course_code: string | null; room: string | null; date: string;
  class_start: string; class_end: string; overlap_start: string; overlap_end: string; overlap_minutes: number;
}
export interface ConflictResult {
  status: ConflictStatus; event_minutes: number; overlap_minutes: number; free_minutes: number;
  timetable_complete: boolean; od_eligible: boolean; conflicts: ConflictItem[];
}

export interface MyRegistration {
  id: string; status: 'registered' | 'cancelled'; pass_code: string; conflict_status: ConflictStatus;
  conflict_minutes: number; registered_at: string; event: CampusEvent;
}

export function useMyRegistrations() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['my-registrations', session?.user.id],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<MyRegistration[]> => {
      // RLS returns only the caller's own registrations.
      const { data, error } = await requireSupabase().from('event_registrations')
        .select(`id, status, pass_code, conflict_status, conflict_minutes, registered_at, event:events(${EVENT_COLUMNS})`)
        .eq('status', 'registered').order('registered_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Array<Omit<MyRegistration, 'event'> & { event: EventRow | null }>)
        .filter(r => r.event).map(r => ({ ...r, event: toCampusEvent(r.event!) }));
    },
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['my-registrations', 'public-events', 'public-event', 'conflict', 'registrants']) qc.invalidateQueries({ queryKey: [key] });
}

export interface RegisterResult { registration_id: string; pass_code: string; seats_left: number; conflict: ConflictResult }

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string): Promise<RegisterResult> => {
      const { data, error } = await requireSupabase().rpc('register_for_event', { p_event_id: eventId });
      if (error) throw error;
      return data as RegisterResult;
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useCancelRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await requireSupabase().rpc('cancel_registration', { p_event_id: eventId });
      if (error) throw error;
    },
    onSettled: () => invalidateAll(qc),
  });
}

export interface Registrant {
  registration_id: string; full_name: string; registration_number: string | null; department_code: string | null;
  academic_year: number | null; status: 'registered' | 'cancelled'; conflict_status: ConflictStatus; conflict_minutes: number; registered_at: string;
}

export function useRegistrants(eventId: string | undefined) {
  return useQuery({
    queryKey: ['registrants', eventId],
    enabled: Boolean(supabase && eventId),
    queryFn: async (): Promise<Registrant[]> => {
      const { data, error } = await requireSupabase().rpc('get_event_registrants', { p_event_id: eventId });
      if (error) throw error;
      return data as Registrant[];
    },
  });
}

export interface SchedulingWarning {
  other_event_id: string; other_title: string; other_club: string; other_venue: string | null;
  other_scope: string; other_status: string; starts_at: string; ends_at: string; reason: string;
}

export function useSchedulingWarnings(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['warnings', eventId],
    enabled: Boolean(supabase && eventId && enabled),
    queryFn: async (): Promise<SchedulingWarning[]> => {
      const { data, error } = await requireSupabase().rpc('event_scheduling_warnings', { p_event_id: eventId });
      if (error) throw error;
      return data as SchedulingWarning[];
    },
  });
}

export const CONFLICT_LABEL: Record<ConflictStatus, string> = {
  no_conflict: 'No class conflict',
  partial_conflict: 'Partial clash with classes',
  full_conflict: 'Clashes with classes for the whole event',
  timetable_not_configured: 'Timetable not set up',
};
