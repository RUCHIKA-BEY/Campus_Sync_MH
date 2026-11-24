// Timetable data (RLS: a student sees and edits ONLY their own slots;
// nobody else, not even DSA/admin, can read them).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, requireSupabase } from './supabase';
import { useAuth } from '../auth/AuthProvider';
import { campusDate } from './time';

export interface Term { id: string; name: string; starts_on: string; ends_on: string }
export interface Slot {
  id: string; term_id: string; subject_name: string; course_code: string | null;
  room: string | null; faculty: string | null; day_of_week: number; start_time: string; end_time: string;
}
export type SlotInput = Omit<Slot, 'id'>;

export function useTerms() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['terms'],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<Term[]> => {
      const { data, error } = await requireSupabase().from('academic_terms').select('id, name, starts_on, ends_on').order('starts_on');
      if (error) throw error;
      return data;
    },
  });
}

/** The term containing today; otherwise the next one; otherwise the latest. */
export function pickCurrentTerm(terms: Term[], today = campusDate()): Term | undefined {
  return terms.find(t => t.starts_on <= today && today <= t.ends_on)
    ?? terms.find(t => t.starts_on > today)
    ?? terms[terms.length - 1];
}

export function useMySlots(termId: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['slots', session?.user.id, termId],
    enabled: Boolean(supabase && session && termId),
    queryFn: async (): Promise<Slot[]> => {
      const { data, error } = await requireSupabase().from('timetable_slots')
        .select('id, term_id, subject_name, course_code, room, faculty, day_of_week, start_time, end_time')
        .eq('term_id', termId!).order('day_of_week').order('start_time');
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveSlot() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SlotInput }) => {
      const db = requireSupabase();
      const { error } = id
        ? await db.from('timetable_slots').update(input).eq('id', id)
        : await db.from('timetable_slots').insert({ ...input, student_id: session!.user.id });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['slots'] }),
  });
}

export function useDeleteSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().from('timetable_slots').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['slots'] }),
  });
}
