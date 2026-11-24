// On-Duty for one event: status of the student's request, or a button to
// request it. The database decides eligibility (registered, OD-eligible,
// a real class clash) and records the clashing classes as evidence.
import { useState } from 'react';
import { BadgeCheck, Clock3, XCircle } from 'lucide-react';
import { Badge, Button } from '../../components/ui';
import { ReasonDialog } from '../../components/ReasonDialog';
import { useToast } from '../../components/Toaster';
import { friendlyError } from '../../lib/errors';
import { OD_LABEL, useMyOdRequests, useRequestOd, useWithdrawOd } from '../../lib/od';

export function OdPanel({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const mine = useMyOdRequests();
  const request = useRequestOd();
  const withdraw = useWithdrawOd();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const forEvent = (mine.data ?? []).filter(r => r.event_id === eventId);
  const active = forEvent.find(r => r.status === 'pending' || r.status === 'approved') ?? forEvent.find(r => r.status === 'rejected');

  return (
    <div className="mt-4 rounded-2xl border border-terracotta/20 bg-peach/60 p-4 text-sm">
      <p className="flex items-center gap-2 font-bold text-plum"><BadgeCheck className="size-4 text-terracotta" aria-hidden />On-Duty</p>
      {active ? (
        <div className="mt-2 grid gap-2">
          <Badge tone={active.status === 'approved' ? 'sage' : active.status === 'pending' ? 'amber' : 'muted'}
                 icon={active.status === 'pending' ? <Clock3 className="size-3" /> : active.status === 'rejected' ? <XCircle className="size-3" /> : undefined}
                 className="justify-self-start">{OD_LABEL[active.status]}</Badge>
          {active.review_note && <p className="text-plum-soft"><strong className="text-plum">Reviewer:</strong> {active.review_note}</p>}
          {active.status === 'approved' && <p className="text-xs text-plum-soft">Approval excuses the class. Your attendance at the event is still recorded separately at check-in.</p>}
          {active.status === 'pending' && (
            <Button variant="ghost" size="sm" className="justify-self-start" loading={withdraw.isPending}
                    onClick={() => withdraw.mutate(active.request_id, { onSuccess: () => toast('OD request withdrawn.'), onError: e => toast(friendlyError(e), 'error') })}>
              Withdraw request
            </Button>
          )}
          {active.status === 'rejected' && <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => setAsking(true)}>Request again</Button>}
        </div>
      ) : (
        <>
          <p className="mt-1 text-plum-soft">If this event clashes with your classes, ask to be excused. We attach the clashing classes automatically.</p>
          <Button size="sm" className="mt-3" onClick={() => setAsking(true)}>Request On-Duty</Button>
        </>
      )}
      {asking && (
        <ReasonDialog title="Request On-Duty" label={`Why do you need OD for “${eventTitle}”?`} confirmLabel="Send request"
          description="The reviewer sees your reason plus the classes the event clashes with."
          onClose={() => setAsking(false)}
          onConfirm={async reason => {
            try { await request.mutateAsync({ eventId, reason }); toast('OD request sent for review.', 'success'); }
            catch (e) { throw new Error(friendlyError(e)); }
          }} />
      )}
    </div>
  );
}
