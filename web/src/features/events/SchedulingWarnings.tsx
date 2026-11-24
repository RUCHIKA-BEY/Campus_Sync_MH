// Campus-wide scheduling warnings (advice, not a block): other important
// events at the same time that could draw the same students.
import { TriangleAlert, LoaderCircle, CircleCheck } from 'lucide-react';
import { friendlyError } from '../../lib/errors';
import { longDate, shortDateTime } from '../../lib/events';
import { useSchedulingWarnings } from '../../lib/registration';

export function SchedulingWarnings({ eventId, scope }: { eventId: string; scope: string }) {
  const enabled = scope !== 'club';
  const q = useSchedulingWarnings(eventId, enabled);
  if (!enabled) return <p className="text-xs text-plum-muted">Club-level events don’t trigger campus-wide clash warnings.</p>;
  if (q.isPending) return <p className="flex items-center gap-2 text-xs text-plum-soft"><LoaderCircle className="size-3.5 animate-spin" aria-hidden />Checking campus schedule…</p>;
  if (q.isError) return <p className="text-xs text-terracotta-deep">{friendlyError(q.error)}</p>;
  if (!q.data.length) {
    return <p className="flex items-center gap-1.5 text-xs font-semibold text-sage"><CircleCheck className="size-3.5" aria-hidden />No campus-wide clashes with other major events.</p>;
  }
  return (
    <div className="rounded-2xl border border-amber/30 bg-amber-bg p-3 text-sm" role="status">
      <p className="flex items-center gap-2 font-bold text-amber"><TriangleAlert className="size-4" aria-hidden />
        {q.data.length} campus-wide {q.data.length === 1 ? 'clash' : 'clashes'} (advice, not a block)</p>
      <ul className="mt-2 grid gap-1.5">
        {q.data.map(w => (
          <li key={w.other_event_id} className="text-plum">
            <strong>{w.other_title}</strong> <span className="text-plum-soft">· {w.other_club} · {w.other_venue ?? 'no venue'}</span>
            <span className="block text-xs text-plum-soft">{longDate(w.starts_at)}, {shortDateTime(w.starts_at).split(', ')[1]} – {shortDateTime(w.ends_at).split(', ')[1]} · {w.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
