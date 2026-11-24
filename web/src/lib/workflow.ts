// Event lifecycle actions. Each one calls a checked database function
// (migration 8); the browser cannot change an event's status any other way.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requireSupabase } from './supabase';

type Args = Record<string, unknown>;

function useRpc<V>(fn: string, toArgs: (v: V) => Args) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: V) => {
      const { error } = await requireSupabase().rpc(fn, toArgs(v));
      if (error) throw error;
    },
    onSettled: () => {
      for (const key of ['club-events', 'dsa-proposals', 'public-events', 'public-event', 'admin-stats', 'audit']) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export type Decision = 'approve' | 'reject' | 'request_changes';

export const useSubmitEvent = () => useRpc<string>('submit_event', id => ({ p_event_id: id }));
export const useReopenEvent = () => useRpc<string>('reopen_event', id => ({ p_event_id: id }));
export const useStartReview = () => useRpc<string>('start_event_review', id => ({ p_event_id: id }));
export const useReviewEvent = () =>
  useRpc<{ id: string; decision: Decision; note?: string }>('review_event', v => ({ p_event_id: v.id, p_decision: v.decision, p_note: v.note ?? null }));
export const usePublishEvent = () => useRpc<string>('publish_event', id => ({ p_event_id: id }));
export const useCompleteEvent = () => useRpc<string>('complete_event', id => ({ p_event_id: id }));
export const useCancelEvent = () =>
  useRpc<{ id: string; reason: string }>('cancel_event', v => ({ p_event_id: v.id, p_reason: v.reason }));
