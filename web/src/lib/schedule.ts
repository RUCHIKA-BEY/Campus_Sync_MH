// "Does this event clash with my classes?" for one event, in every mode.
//
//   real event, backend connected   → check_timetable_conflict(event)      source 'database'
//   sample event, backend connected → check_timetable_window(start, end)   source 'preview'
//                                     (your REAL timetable, a sample event)
//   no backend (sample mode)        → computeConflict on the sample week   source 'sample'
//
// The answer is a state, never a guess: while checking it is 'checking',
// and a failed request is 'unavailable', never "no conflict".
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { requireSupabase, supabase } from './supabase';
import { friendlyError } from './errors';
import { computeConflict } from './conflict';
import { SAMPLE_ALLOW_FULL_CONFLICT, SAMPLE_SLOTS, SAMPLE_TERMS } from './sampleTimetable';
import type { CampusEvent } from './events';
import type { ConflictResult } from './registration';

export type ScheduleSource = 'database' | 'preview' | 'sample';

export type ScheduleState =
  | { kind: 'not-applicable' }                  // event over, cancelled or completed
  | { kind: 'signed-out' }
  | { kind: 'not-student' }
  | { kind: 'checking' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'result'; result: ConflictResult; source: ScheduleSource };

type Ev = Pick<CampusEvent, 'id' | 'startsAt' | 'endsAt' | 'odEligible' | 'isSample' | 'lifecycle'>;

/** Which check applies, and how to run it. Exported for tests. */
export function scheduleMode(event: Ev, opts: { connected: boolean; ready: boolean; signedIn: boolean; role: string | undefined; now: Date }):
  'not-applicable' | 'signed-out' | 'not-student' | 'checking' | ScheduleSource {
  if (event.lifecycle !== 'published' || Date.parse(event.endsAt) <= opts.now.getTime()) return 'not-applicable';
  if (!opts.connected) return 'sample';
  if (!opts.ready) return 'checking';
  if (!opts.signedIn) return 'signed-out';
  if (!opts.role) return 'checking';             // profile still loading
  if (opts.role !== 'student') return 'not-student';
  return event.isSample ? 'preview' : 'database';
}

async function fetchResult(source: 'database' | 'preview', event: Ev): Promise<ConflictResult> {
  const db = requireSupabase();
  const { data, error } = source === 'database'
    ? await db.rpc('check_timetable_conflict', { p_event_id: event.id })
    : await db.rpc('check_timetable_window', { p_starts_at: event.startsAt, p_ends_at: event.endsAt });
  if (error) throw error;
  if (!data || typeof data !== 'object' || !('status' in data)) throw new Error('Unexpected answer from the timetable check.');
  // A sample event's OD flag is not stored in the database; take it from the event.
  return source === 'preview' ? { ...(data as ConflictResult), od_eligible: event.odEligible } : (data as ConflictResult);
}

export const unavailableMessage = (e: unknown) => {
  const msg = friendlyError(e);
  // Migration 14 not applied yet on this database.
  if (/check_timetable_window|PGRST202|could not find the function/i.test(`${(e as { code?: string })?.code ?? ''} ${(e as Error)?.message ?? ''}`)) {
    return 'The timetable preview for sample events isn’t enabled on the server yet.';
  }
  return msg;
};

/** Turns the mode and the request's progress into what the UI shows.
 *  A failed request is 'unavailable'; nothing becomes 'no conflict' by default. */
export function deriveState(
  mode: ReturnType<typeof scheduleMode>,
  q: { isError: boolean; isPending: boolean; isFetching: boolean; data?: ConflictResult; error: unknown },
  sample: ConflictResult | null,
): ScheduleState {
  if (mode === 'not-applicable' || mode === 'signed-out' || mode === 'not-student' || mode === 'checking') return { kind: mode };
  if (mode === 'sample') return sample ? { kind: 'result', result: sample, source: 'sample' } : { kind: 'checking' };
  if (q.isError) return q.isFetching ? { kind: 'checking' } : { kind: 'unavailable', message: unavailableMessage(q.error) };
  if (q.isPending || !q.data) return { kind: 'checking' };
  return { kind: 'result', result: q.data, source: mode };
}

export function useScheduleCheck(event: Ev | null | undefined, now: Date) {
  const { session, profile, ready } = useAuth();
  const qc = useQueryClient();
  const mode = event
    ? scheduleMode(event, { connected: Boolean(supabase), ready, signedIn: Boolean(session), role: profile?.role, now })
    : 'not-applicable';
  const remote = mode === 'database' || mode === 'preview';
  // Under 'conflict', so registering or cancelling refreshes it.
  const queryKey = useMemo(() => mode === 'database'
    ? ['conflict', session?.user.id, event?.id]
    : ['conflict', session?.user.id, 'window', event?.startsAt, event?.endsAt], [mode, session?.user.id, event?.id, event?.startsAt, event?.endsAt]);

  const q = useQuery({
    queryKey,
    enabled: Boolean(event && remote),
    queryFn: () => fetchResult(mode as 'database' | 'preview', event!),
    retry: 1,
  });

  const sample = useMemo(() => (event && mode === 'sample' ? computeConflict(event, SAMPLE_TERMS, SAMPLE_SLOTS) : null), [event, mode]);

  const state = deriveState(mode, q, sample);

  /** A FRESH check (never the cached one), used right before registering. */
  const recheck = useCallback(async (): Promise<ScheduleState> => {
    if (!event) return { kind: 'not-applicable' };
    if (mode === 'sample') return { kind: 'result', result: computeConflict(event, SAMPLE_TERMS, SAMPLE_SLOTS), source: 'sample' };
    if (!remote) return { kind: mode } as ScheduleState;
    try {
      const result = await qc.fetchQuery({ queryKey, queryFn: () => fetchResult(mode, event), staleTime: 0, retry: 0 });
      return { kind: 'result', result, source: mode };
    } catch (e) {
      return { kind: 'unavailable', message: unavailableMessage(e) };
    }
  }, [event, mode, remote, qc, queryKey]);

  return { state, recheck, retry: () => q.refetch() };
}

/** Platform setting D8: may a student register when EVERY minute clashes
 *  with class on an event that is not OD-eligible? undefined = unknown
 *  (the server still decides at registration). */
export function useFullConflictPolicy(): boolean | undefined {
  const { session } = useAuth();
  const q = useQuery({
    queryKey: ['setting', 'allow_registration_on_full_conflict'],
    enabled: Boolean(supabase && session),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await requireSupabase().from('platform_settings').select('value')
        .eq('key', 'allow_registration_on_full_conflict').maybeSingle();
      if (error) throw error;
      return data ? data.value !== false : true;   // same default as register_for_event
    },
  });
  if (!supabase) return SAMPLE_ALLOW_FULL_CONFLICT;
  return q.data;
}

export const hasClash = (s: ScheduleState) =>
  s.kind === 'result' && (s.result.status === 'partial_conflict' || s.result.status === 'full_conflict');
