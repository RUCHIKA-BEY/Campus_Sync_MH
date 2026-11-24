import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, FileClock, Inbox, CheckCircle2, XCircle, MapPin, FlaskConical, Eye, Megaphone, PlayCircle } from 'lucide-react';
import { Badge, Button, Card, EmptyState, FormStatus, PageHeader, Skeleton } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { StatCard } from '../../components/StatCard';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toaster';
import { isConfigured } from '../../lib/env';
import { friendlyError } from '../../lib/errors';
import { longDate, shortDateTime } from '../../lib/events';
import { requireSupabase, supabase } from '../../lib/supabase';
import { STATUS_LABEL, type EventStatus } from '../../lib/organizer';
import { usePublishEvent, useReviewEvent, useStartReview, type Decision } from '../../lib/workflow';
import { SchedulingWarnings } from '../events/SchedulingWarnings';

interface Proposal {
  id: string; title: string; description: string; status: EventStatus; scope: string; event_type: string;
  starts_at: string; ends_at: string; registration_opens_at: string; registration_closes_at: string;
  submitted_at: string | null; capacity: number; od_eligible: boolean; review_note: string | null;
  club: { name: string } | null; venue: { name: string; capacity: number } | null; category: { name: string } | null;
}
interface OdRow { id: string; status: string; reason: string; requested_at: string }

const AWAITING: EventStatus[] = ['submitted', 'under_review'];

// RLS: DSA can read every non-draft event and (as the configured OD
// reviewer) every OD request. Drafts stay private to their club.
function useProposals() {
  return useQuery({
    queryKey: ['dsa-proposals'], enabled: Boolean(supabase),
    queryFn: async (): Promise<Proposal[]> => {
      const { data, error } = await requireSupabase().from('events')
        .select('id, title, description, status, scope, event_type, starts_at, ends_at, registration_opens_at, registration_closes_at, submitted_at, capacity, od_eligible, review_note, club:clubs(name), venue:venues(name, capacity), category:categories(name)')
        .neq('status', 'draft').order('submitted_at', { ascending: false, nullsFirst: false }).limit(100);
      if (error) throw error;
      return data as unknown as Proposal[];
    },
  });
}
function useOdQueue() {
  return useQuery({
    queryKey: ['dsa-od'], enabled: Boolean(supabase),
    queryFn: async (): Promise<OdRow[]> => {
      const { data, error } = await requireSupabase().from('od_requests')
        .select('id, status, reason, requested_at').eq('status', 'pending').order('requested_at').limit(100);
      if (error) throw error;
      return data;
    },
  });
}

type Tab = 'proposals' | 'od';

export function DsaPage() {
  const proposals = useProposals();
  const od = useOdQueue();
  const [tab, setTab] = useState<Tab>('proposals');
  const [reviewing, setReviewing] = useState<Proposal | null>(null);

  if (!isConfigured) {
    return <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6"><PageHeader kicker="DSA clearance desk" title="DSA desk" />
      <Card className="flex items-start gap-3 p-6 text-plum-soft"><FlaskConical className="mt-0.5 size-5 text-amber" aria-hidden /><p>The review desk needs the backend. Connect Supabase to use it.</p></Card></div>;
  }

  const p = proposals.data ?? [];
  const waiting = p.filter(e => AWAITING.includes(e.status));
  const decided = p.filter(e => !AWAITING.includes(e.status));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <PageHeader kicker="DSA clearance desk" title="Review desk">Event proposals and On-Duty requests waiting for a decision.</PageHeader>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Proposals awaiting review" value={waiting.length} icon={FileClock} loading={proposals.isPending} />
        <StatCard label="Approved / published" value={p.filter(e => ['approved', 'published'].includes(e.status)).length} icon={CheckCircle2} loading={proposals.isPending} />
        <StatCard label="Rejected / changes asked" value={p.filter(e => ['rejected', 'changes_requested'].includes(e.status)).length} icon={XCircle} loading={proposals.isPending} />
        <StatCard label="Pending OD requests" value={od.data?.length} icon={ClipboardCheck} loading={od.isPending} />
      </div>

      <div className="mb-5">
        <Tabs label="Queues" layoutId="dsa-tab" value={tab} onChange={setTab} items={[
          { id: 'proposals', label: 'Event proposals', icon: FileClock, count: waiting.length },
          { id: 'od', label: 'OD requests', icon: ClipboardCheck, count: od.data?.length },
        ]} />
      </div>

      {tab === 'proposals' && (
        proposals.isError ? <FormStatus kind="error">{friendlyError(proposals.error)}</FormStatus>
        : proposals.isPending ? <Skeleton className="h-48" />
        : p.length === 0 ? (
          <EmptyState icon={<Inbox className="size-6" />} title="No proposals yet">
            When organizers submit events for approval, they queue here. Venue double-booking is checked automatically on submission and again on approval.
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            {[...waiting, ...decided].map(e => <ProposalRow key={e.id} e={e} onReview={() => setReviewing(e)} />)}
          </div>
        )
      )}

      {tab === 'od' && (
        od.isError ? <FormStatus kind="error">{friendlyError(od.error)}</FormStatus>
        : od.isPending ? <Skeleton className="h-48" />
        : !od.data?.length ? (
          <EmptyState icon={<ClipboardCheck className="size-6" />} title="No pending OD requests">
            Students request On-Duty after registering for an eligible event that clashes with their classes (Stages 6–7).
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            {od.data.map(r => (
              <Card key={r.id} className="p-4 text-sm">
                <p className="text-xs text-plum-soft">Requested {shortDateTime(r.requested_at)}</p>
                <p className="mt-1">{r.reason}</p>
              </Card>
            ))}
          </div>
        )
      )}

      {reviewing && <ReviewDialog e={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}

function ProposalRow({ e, onReview }: { e: Proposal; onReview: () => void }) {
  const start = useStartReview();
  const publish = usePublishEvent();
  const toast = useToast();
  const awaiting = AWAITING.includes(e.status);
  return (
    <Card className="flex flex-wrap items-center gap-4 p-4">
      <div className="min-w-0 flex-1 basis-72">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={awaiting ? 'amber' : e.status === 'approved' || e.status === 'published' ? 'sage' : 'neutral'}>{STATUS_LABEL[e.status]}</Badge>
          <span className="text-xs text-plum-soft">{e.club?.name} · {e.scope}</span></div>
        <h3 className="mt-1.5 truncate text-base">{e.title}</h3>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-plum-soft">
          <span>{longDate(e.starts_at)}</span>
          <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{e.venue?.name ?? 'No venue'}</span>
          {e.submitted_at && <span>Submitted {shortDateTime(e.submitted_at)}</span>}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {e.status === 'submitted' && (
          <Button size="sm" variant="secondary" loading={start.isPending}
            onClick={() => start.mutate(e.id, { onSuccess: () => toast('Marked as under review. The organizer was notified.', 'success'), onError: err => toast(friendlyError(err), 'error') })}>
            <PlayCircle className="size-4" />Start review
          </Button>
        )}
        {awaiting && <Button size="sm" onClick={onReview}><Eye className="size-4" />Review</Button>}
        {e.status === 'approved' && (
          <Button size="sm" loading={publish.isPending}
            onClick={() => publish.mutate(e.id, { onSuccess: () => toast('Published to Discover.', 'success'), onError: err => toast(friendlyError(err), 'error') })}>
            <Megaphone className="size-4" />Publish
          </Button>
        )}
      </div>
    </Card>
  );
}

function ReviewDialog({ e, onClose }: { e: Proposal; onClose: () => void }) {
  const review = useReviewEvent();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const overCapacity = e.venue && e.capacity > e.venue.capacity;

  const decide = (decision: Decision) => {
    setError(null);
    if (decision !== 'approve' && note.trim().length < 10) return setError('Please write a reason of at least 10 characters for the organizer.');
    review.mutate({ id: e.id, decision, note: note.trim() || undefined }, {
      onSuccess: () => {
        toast(decision === 'approve' ? 'Approved. The organizer can now publish it.' : decision === 'reject' ? 'Rejected. The organizer was notified.' : 'Changes requested. The organizer was notified.', 'success');
        onClose();
      },
      onError: err => setError(friendlyError(err)),
    });
  };

  const rows: Array<[string, string]> = [
    ['Club', e.club?.name ?? '—'], ['Category · type', `${e.category?.name ?? '—'} · ${e.event_type.replace('_', ' ')}`],
    ['When', `${longDate(e.starts_at)}, ${shortDateTime(e.starts_at).split(', ')[1]} – ${shortDateTime(e.ends_at)}`],
    ['Venue', e.venue ? `${e.venue.name} (holds ${e.venue.capacity})` : 'None'],
    ['Capacity', String(e.capacity)], ['Scope', e.scope],
    ['Registration', `${shortDateTime(e.registration_opens_at)} → ${shortDateTime(e.registration_closes_at)}`],
    ['On-Duty', e.od_eligible ? 'Eligible' : 'Not eligible'],
  ];

  return (
    <Modal wide open onOpenChange={o => !o && onClose()} title={e.title} description="Review the proposal and record your decision. Every decision is audited.">
      <div className="grid gap-5">
        <dl className="grid gap-x-6 gap-y-3 rounded-2xl bg-cream p-4 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-plum-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
        </dl>
        <div><p className="text-xs font-semibold text-plum-muted">Description</p><p className="mt-1 text-sm whitespace-pre-line text-plum-soft">{e.description}</p></div>
        {overCapacity && <FormStatus kind="error">Capacity is larger than the venue holds. Approval will be refused.</FormStatus>}
        <p className="rounded-xl border border-line bg-white px-3 py-2 text-xs text-plum-soft">
          ✓ No other proposal holds this venue at an overlapping time (the database guarantees this, and re-checks on approval).
        </p>
        <SchedulingWarnings eventId={e.id} scope={e.scope} />
        <label className="grid gap-1.5 text-[13px] font-semibold text-plum-soft">
          Note to the organizer <span className="font-normal text-plum-muted">(required to reject or request changes)</span>
          <textarea value={note} onChange={ev => setNote(ev.target.value)} rows={3} maxLength={1000}
            className="w-full rounded-xl border border-line bg-field px-3.5 py-2.5 text-base text-plum focus:border-plum focus:bg-white focus:ring-3 focus:ring-plum/10 focus:outline-none" />
        </label>
        <FormStatus kind="error">{error}</FormStatus>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => decide('reject')} disabled={review.isPending} className="text-terracotta-deep"><XCircle className="size-4" />Reject</Button>
          <Button variant="secondary" onClick={() => decide('request_changes')} disabled={review.isPending}>Request changes</Button>
          <Button onClick={() => decide('approve')} loading={review.isPending}><CheckCircle2 className="size-4" />Approve</Button>
        </div>
      </div>
    </Modal>
  );
}
