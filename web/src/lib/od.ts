// On-Duty requests and attendance. Every rule lives in the database
// functions of migration 10; these hooks only call them and refresh views.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, supabase } from './supabase';
import { useAuth } from '../auth/AuthProvider';
import type { ConflictItem } from './registration';

export type OdStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface MyOdRequest {
  request_id: string; event_id: string; event_title: string; status: OdStatus; reason: string;
  review_note: string | null; requested_at: string; reviewed_at: string | null; conflict_snapshot: ConflictItem[];
}
export interface OdQueueRow extends Omit<MyOdRequest, 'request_id'> {
  request_id: string; student_name: string; registration_number: string | null; department_code: string | null;
  starts_at: string; ends_at: string; club_name: string;
}
export interface AttendanceRow {
  registration_id: string; full_name: string; registration_number: string | null; department_code: string | null;
  registration_status: 'registered' | 'cancelled'; checked_in_at: string | null; method: 'qr' | 'manual' | null;
  verification_status: 'verified' | 'revoked' | null; open_session_id: string | null; session_closes_at: string | null;
}
export interface MyAttendance { event_id: string; event_title: string; starts_at: string; checked_in_at: string; method: 'qr' | 'manual'; verification_status: string }

const rpc = async <T>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw error;
  return data as T;
};

function useRefresh() {
  const qc = useQueryClient();
  return () => { for (const k of ['my-od', 'od-queue', 'dsa-od', 'attendance', 'my-attendance', 'admin-stats', 'audit']) qc.invalidateQueries({ queryKey: [k] }); };
}

// ---------------------------------------------------------------- OD
export function useMyOdRequests() {
  const { session } = useAuth();
  return useQuery({ queryKey: ['my-od', session?.user.id], enabled: Boolean(supabase && session), queryFn: () => rpc<MyOdRequest[]>('my_od_requests') });
}
export function useRequestOd() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (v: { eventId: string; reason: string }) => rpc<string>('request_od', { p_event_id: v.eventId, p_reason: v.reason }), onSettled: refresh });
}
export function useWithdrawOd() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id: string) => rpc<void>('withdraw_od', { p_request_id: id }), onSettled: refresh });
}
export function useOdQueue(status: OdStatus | null) {
  return useQuery({ queryKey: ['od-queue', status], enabled: Boolean(supabase), queryFn: () => rpc<OdQueueRow[]>('get_od_queue', { p_status: status }) });
}
export function useDecideOd() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (v: { id: string; decision: 'approve' | 'reject'; note?: string }) => rpc<void>('decide_od', { p_request_id: v.id, p_decision: v.decision, p_note: v.note ?? null }),
    onSettled: refresh,
  });
}

// --------------------------------------------------------- attendance
export function useEventAttendance(eventId: string | undefined, live = false) {
  return useQuery({
    queryKey: ['attendance', eventId], enabled: Boolean(supabase && eventId),
    queryFn: () => rpc<AttendanceRow[]>('get_event_attendance', { p_event_id: eventId }),
    refetchInterval: live ? 5000 : false, // keep the roster fresh while check-in is open
  });
}
export function useMyAttendance() {
  const { session } = useAuth();
  return useQuery({ queryKey: ['my-attendance', session?.user.id], enabled: Boolean(supabase && session), queryFn: () => rpc<MyAttendance[]>('my_attendance') });
}
export function useOpenSession() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (v: { eventId: string; minutes: number }) => rpc('open_attendance_session', { p_event_id: v.eventId, p_minutes: v.minutes }), onSettled: refresh });
}
export function useCloseSession() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id: string) => rpc<void>('close_attendance_session', { p_session_id: id }), onSettled: refresh });
}
export function useCheckIn() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (v: { eventId: string; code: string }) => rpc<{ student_name: string; registration_number: string | null; checked_in_at: string }>('check_in', { p_event_id: v.eventId, p_pass_code: v.code }),
    onSettled: refresh,
  });
}
export function useMarkManual() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (registrationId: string) => rpc<void>('mark_attendance_manual', { p_registration_id: registrationId }), onSettled: refresh });
}
export function useRevokeAttendance() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (v: { registrationId: string; reason: string }) => rpc<void>('revoke_attendance', { p_registration_id: v.registrationId, p_reason: v.reason }), onSettled: refresh });
}

export const OD_LABEL: Record<OdStatus, string> = { pending: 'OD pending', approved: 'OD approved', rejected: 'OD not approved', withdrawn: 'OD withdrawn' };
