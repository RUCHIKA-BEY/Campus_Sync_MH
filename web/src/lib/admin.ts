// Admin data. Every query here is ALSO protected by RLS: a non-admin
// calling these gets only their own rows (or nothing), and role changes go
// through admin_set_user_role(), which re-checks the caller is an admin.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, supabase } from './supabase';
import type { AppRole } from './types';

const enabled = Boolean(supabase);

/** Exact row count without downloading rows (HEAD request + COUNT). */
async function count(table: string, filter?: (q: any) => any): Promise<number> {
  let q = requireSupabase().from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  if (error) throw error;
  return n ?? 0;
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    enabled,
    queryFn: async () => {
      const roles: AppRole[] = ['student', 'organizer', 'dsa', 'admin'];
      const [byRole, clubs, venues, events, pendingOd] = await Promise.all([
        Promise.all(roles.map(r => count('profiles', q => q.eq('role', r)))),
        count('clubs'), count('venues'), count('events'),
        count('od_requests', q => q.eq('status', 'pending')),
      ]);
      return { roles: Object.fromEntries(roles.map((r, i) => [r, byRole[i]!])) as Record<AppRole, number>, clubs, venues, events, pendingOd };
    },
  });
}

export interface AdminUser {
  id: string; full_name: string; email: string; role: AppRole; is_active: boolean;
  registration_number: string | null; department: { code: string } | null;
}

export function useAllUsers() {
  return useQuery({
    queryKey: ['admin-users'],
    enabled,
    queryFn: async (): Promise<AdminUser[]> => {
      const { data, error } = await requireSupabase().from('profiles')
        .select('id, full_name, email, role, is_active, registration_number, department:departments(code)')
        .order('full_name').limit(500);
      if (error) throw error;
      return data as unknown as AdminUser[];
    },
  });
}

export function useSetRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await requireSupabase().rpc('admin_set_user_role', { p_user_id: userId, p_role: role });
      if (error) throw error;
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); qc.invalidateQueries({ queryKey: ['admin-stats'] }); qc.invalidateQueries({ queryKey: ['audit'] }); },
  });
}

export function useSetActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const { error } = await requireSupabase().rpc('admin_set_user_active', { p_user_id: userId, p_active: active });
      if (error) throw error;
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); qc.invalidateQueries({ queryKey: ['audit'] }); },
  });
}

export interface ClubWithMembers {
  id: string; name: string; short_name: string;
  club_members: Array<{ id: string; membership_role: 'lead' | 'coordinator' | 'member'; membership_status: string;
    user: { id: string; full_name: string; email: string; role: AppRole } | null }>;
}

export function useClubsWithMembers() {
  return useQuery({
    queryKey: ['admin-clubs'],
    enabled,
    queryFn: async (): Promise<ClubWithMembers[]> => {
      const { data, error } = await requireSupabase().from('clubs')
        .select('id, name, short_name, club_members(id, membership_role, membership_status, user:profiles(id, full_name, email, role))')
        .order('name');
      if (error) throw error;
      return data as unknown as ClubWithMembers[];
    },
  });
}

export function useAddClubManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clubId, userId, role }: { clubId: string; userId: string; role: 'lead' | 'coordinator' }) => {
      const { error } = await requireSupabase().from('club_members')
        .insert({ club_id: clubId, user_id: userId, membership_role: role, membership_status: 'active' });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin-clubs'] }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await requireSupabase().from('club_members').delete().eq('id', memberId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin-clubs'] }),
  });
}

export interface AuditRow {
  id: number; action: string; entity_type: string; entity_id: string | null;
  metadata: Record<string, unknown>; created_at: string; actor: { full_name: string; email: string } | null;
}

export function useAuditLog() {
  return useQuery({
    queryKey: ['audit'],
    enabled,
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await requireSupabase().from('audit_logs')
        .select('id, action, entity_type, entity_id, metadata, created_at, actor:profiles(full_name, email)')
        .order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data as unknown as AuditRow[];
    },
  });
}
