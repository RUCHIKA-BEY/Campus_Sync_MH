// In-app notifications. RLS shows each user only their own inbox, and the
// only column they may change is is_read. (Email/push are NOT implemented.)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, supabase } from './supabase';
import { useAuth } from '../auth/AuthProvider';

export interface AppNotification {
  id: string; type: string; title: string; message: string; is_read: boolean; created_at: string;
  related_entity_type: string | null; related_entity_id: string | null;
}

const POLL_MS = 60_000;

export function useUnreadCount() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['notifications', 'unread', session?.user.id],
    enabled: Boolean(supabase && session),
    refetchInterval: POLL_MS,
    queryFn: async () => {
      // HEAD + COUNT: no rows downloaded.
      const { count, error } = await requireSupabase().from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useNotifications(limit = 15, onlyUnread = false) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['notifications', 'list', session?.user.id, limit, onlyUnread],
    enabled: Boolean(supabase && session),
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<AppNotification[]> => {
      let q = requireSupabase().from('notifications')
        .select('id, type, title, message, is_read, created_at, related_entity_type, related_entity_id')
        .order('created_at', { ascending: false }).limit(limit);
      if (onlyUnread) q = q.eq('is_read', false);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().from('notifications').update({ is_read: true }).eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // RLS limits this UPDATE to the caller's own rows.
      const { error } = await requireSupabase().from('notifications').update({ is_read: true }).eq('is_read', false);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/** Where clicking a notification should take you. */
export function notificationLink(n: AppNotification): string | null {
  const t = n.type, id = n.related_entity_id;
  if (t === 'event_submitted' || t === 'od_requested') return '/dsa';
  if (['event_under_review', 'event_approved', 'event_rejected', 'event_changes_requested', 'event_published'].includes(t)) return '/organizer';
  if (t.startsWith('od_')) return '/registrations';
  if (t === 'role_changed') return '/profile';
  if (n.related_entity_type === 'event' && id) return `/events/${id}`;
  return null;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); if (d < 7) return `${d} d ago`;
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(new Date(iso));
}
