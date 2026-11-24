// On-Duty review queue (get_od_queue). Decisions go through decide_od(),
// which re-checks that the caller is a configured OD reviewer.
import { useState } from 'react';
import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
import { Badge, Button, Card, EmptyState, FormStatus, Skeleton } from '../../components/ui';
import { ReasonDialog } from '../../components/ReasonDialog';
import { useToast } from '../../components/Toaster';
import { friendlyError } from '../../lib/errors';
import { longDate, shortDateTime } from '../../lib/events';
import { OD_LABEL, useDecideOd, useOdQueue, type OdQueueRow } from '../../lib/od';
import { clockLabel } from '../../lib/time';

const ist = (iso: string) => clockLabel(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));

export function OdQueue() {
  const [showDecided, setShowDecided] = useState(false);
  const q = useOdQueue(showDecided ? null : 'pending');
  if (q.isError) return <FormStatus kind="error">{friendlyError(q.error)}</FormStatus>;
  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 justify-self-end text-sm font-semibold text-plum-soft">
        <input type="checkbox" checked={showDecided} onChange={e => setShowDecided(e.target.checked)} className="size-4 accent-terracotta" />
        Show decided requests too
      </label>
      {q.isPending ? <Skeleton className="h-40" />
        : !q.data.length ? (
          <EmptyState icon={<ClipboardCheck className="size-6" />} title={showDecided ? 'No OD requests yet' : 'No pending OD requests'}>
            Students request On-Duty from the event page after registering for an OD-eligible event that clashes with their classes.
          </EmptyState>
        ) : q.data.map(r => <OdRow key={r.request_id} r={r} />)}
    </div>
  );
}

function OdRow({ r }: { r: OdQueueRow }) {
  const decide = useDecideOd();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{r.student_name} <span className="text-sm font-normal text-plum-soft">{[r.registration_number, r.department_code].filter(Boolean).join(' · ')}</span></p>
          <p className="text-sm text-plum-soft">{r.event_title} · {r.club_name} · {longDate(r.starts_at)}</p>
        </div>
        <Badge tone={r.status === 'approved' ? 'sage' : r.status === 'pending' ? 'amber' : 'muted'}>{OD_LABEL[r.status]}</Badge>
      </div>
      <p className="mt-3 text-sm"><span className="text-plum-muted">Reason:</span> {r.reason}</p>
      {r.conflict_snapshot.length > 0 && (
        <div className="mt-2 rounded-xl bg-cream px-3 py-2 text-xs text-plum-soft">
          <p className="font-semibold text-plum">Classes missed (recorded when requested)</p>
          <ul className="mt-1 grid gap-0.5">
            {r.conflict_snapshot.map((c, i) => <li key={i}>{c.subject}{c.course_code ? ` (${c.course_code})` : ''}: {ist(c.overlap_start)}–{ist(c.overlap_end)}, {c.overlap_minutes} min</li>)}
          </ul>
        </div>
      )}
      {r.review_note && <p className="mt-2 text-xs text-plum-soft">Note: {r.review_note}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-plum-muted">Requested {shortDateTime(r.requested_at)}</span>
        {r.status === 'pending' && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-terracotta-deep" onClick={() => setRejecting(true)}><XCircle className="size-4" />Reject</Button>
            <Button size="sm" loading={decide.isPending}
              onClick={() => decide.mutate({ id: r.request_id, decision: 'approve' }, { onSuccess: () => toast('OD approved. The student was notified.', 'success'), onError: e => toast(friendlyError(e), 'error') })}>
              <CheckCircle2 className="size-4" />Approve
            </Button>
          </div>
        )}
      </div>
      {rejecting && (
        <ReasonDialog title={`Reject OD for ${r.student_name}?`} label="Reason (shown to the student)" confirmLabel="Reject request" onClose={() => setRejecting(false)}
          onConfirm={async note => {
            try { await decide.mutateAsync({ id: r.request_id, decision: 'reject', note }); toast('OD rejected. The student was notified.', 'success'); }
            catch (e) { throw new Error(friendlyError(e)); }
          }} />
      )}
    </Card>
  );
}
