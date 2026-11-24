// Role dashboards: each number comes from ONE aggregate database function
// (migration 11) that checks the caller's role first.
import { useQuery } from '@tanstack/react-query';
import { requireSupabase, supabase } from './supabase';
import { useAuth } from '../auth/AuthProvider';
import type { ConflictStatus } from './registration';

const call = async <T>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw error;
  return data as T;
};

export interface StudentDash {
  upcoming_registrations: number; pending_od: number; approved_od: number; events_attended: number;
  clubs_followed: number; active_clubs: number; upcoming_public_events: number; timetable_classes: number; interests: number;
}
export interface OrganizerDash {
  total_events: number; by_status: Record<string, number>; total_registrations: number; seats_available: number;
  attendance_rate: number | null;
  upcoming: Array<{ id: string; title: string; starts_at: string; status: string; capacity: number; registered: number; checked_in: number }>;
}
export interface DsaDash {
  awaiting_review: number; changes_requested: number; approved_30d: number; rejected_30d: number; published_upcoming: number;
  avg_decision_hours: number | null; od_pending: number; od_approved_30d: number; od_rejected_30d: number;
}
export interface AdminDash {
  users_by_role: Partial<Record<'student' | 'organizer' | 'dsa' | 'admin', number>>; active_clubs: number; venues: number;
  events_by_status: Record<string, number>; upcoming_published: number; registrations_active: number; attendance_verified: number;
  attendance_rate: number | null; od_by_status: Record<string, number>;
  registrations_14d: Array<{ day: string; n: number }>; events_by_category: Array<{ category: string; n: number }>;
}
export interface Recommendation { event_id: string; score: number; reasons: string[]; conflict_status: ConflictStatus }

function useDash<T>(fn: string, enabled: boolean) {
  const { session } = useAuth();
  return useQuery({ queryKey: ['dash', fn, session?.user.id], enabled: Boolean(supabase && session && enabled), queryFn: () => call<T>(fn) });
}

export const useStudentDashboard = (enabled = true) => useDash<StudentDash>('student_dashboard', enabled);
export const useOrganizerDashboard = (enabled = true) => useDash<OrganizerDash>('organizer_dashboard', enabled);
export const useDsaDashboard = (enabled = true) => useDash<DsaDash>('dsa_dashboard', enabled);
export const useAdminDashboard = (enabled = true) => useDash<AdminDash>('admin_dashboard', enabled);

export function useRecommendations(limit = 6, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['recommendations', session?.user.id, limit],
    enabled: Boolean(supabase && session && enabled),
    queryFn: () => call<Recommendation[]>('get_recommendations', { p_limit: limit }),
  });
}
