// Database reads/writes wrapped in TanStack Query hooks.
// TanStack Query gives every request loading / error / cached states and
// re-fetches after changes, so components never hand-roll that logic.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, requireSupabase } from './supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Category, Club, Department } from './types';

const ONE_HOUR = 60 * 60 * 1000;

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    enabled: Boolean(supabase),
    staleTime: ONE_HOUR,
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await requireSupabase().from('departments').select('id, code, name').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    enabled: Boolean(supabase),
    staleTime: ONE_HOUR,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await requireSupabase().from('categories').select('id, name, slug').order('sort_order');
      if (error) throw error;
      return data;
    },
  });
}

export function useClubs() {
  return useQuery({
    queryKey: ['clubs'],
    enabled: Boolean(supabase),
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Club[]> => {
      // `category:categories(name, slug)` follows the foreign key in one request.
      const { data, error } = await requireSupabase()
        .from('clubs').select('id, name, short_name, description, category:categories(name, slug)').order('name');
      if (error) throw error;
      return data as unknown as Club[];
    },
  });
}

// ---- Personal data (RLS: own rows only) --------------------------------
export function useMyInterestIds() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['interests', session?.user.id],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await requireSupabase().from('student_interests').select('category_id');
      if (error) throw error;
      return new Set(data.map(r => r.category_id as string));
    },
  });
}

export function useToggleInterest() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoryId, selected }: { categoryId: string; selected: boolean }) => {
      const db = requireSupabase();
      const studentId = session!.user.id;
      const { error } = selected
        ? await db.from('student_interests').insert({ student_id: studentId, category_id: categoryId })
        : await db.from('student_interests').delete().eq('student_id', studentId).eq('category_id', categoryId);
      if (error && error.code !== '23505') throw error; // 23505 = already selected
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['interests'] }),
  });
}

export function useMyFollowedClubIds() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['follows', session?.user.id],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await requireSupabase().from('club_follows').select('club_id');
      if (error) throw error;
      return new Set(data.map(r => r.club_id as string));
    },
  });
}

export function useToggleFollow() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clubId, follow }: { clubId: string; follow: boolean }) => {
      const db = requireSupabase();
      const studentId = session!.user.id;
      const { error } = follow
        ? await db.from('club_follows').insert({ student_id: studentId, club_id: clubId })
        : await db.from('club_follows').delete().eq('student_id', studentId).eq('club_id', clubId);
      if (error && error.code !== '23505') throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['follows'] }),
  });
}
