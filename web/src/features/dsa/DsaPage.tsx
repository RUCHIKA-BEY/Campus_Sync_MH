import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, FileClock, Inbox, CheckCircle2, XCircle, MapPin, FlaskConical } from 'lucide-react';
import { Badge, Button, Card, EmptyState, FormStatus, PageHeader, Skeleton } from '../../components/ui';
import { StatCard } from '../../components/StatCard';
import { Tabs } from '../../components/Tabs';
import { isConfigured } from '../../lib/env';
import { friendlyError } from '../../lib/errors';
import { longDate, shortDateTime } from '../../lib/events';
import { requireSupabase, supabase } from '../../lib/supabase';
import { STATUS_LABEL, type EventStatus } from '../../lib/organizer';

interface Proposal {
  id: string; title: string; status: EventStatus; starts_at: string; submitted_at: string | null; scope: string;
  club: { name: string } | null; venue: { name: string } | null;
}
interface OdRow { id: string; status: string; reason: string; requested_at: string }

// RLS: DSA can read every non-draft event and (as the configured OD
// reviewer) every OD request. Drafts stay private to their club.
function useProposals() {
  return useQuery({
    queryKey: ['dsa-proposals'], enabled: Boolean(supabase),
    queryFn: async (): Promise<Proposal[]> => {
      const { data, error } = await requireSupabase().from('events')
        .select('id, title, status, starts_at, submitted_at, scope, club:clubs(name), venue:venues(name)')
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

  if (!isConfigured) {
    return <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6"><PageHeader kicker="DSA clearance desk" title="DSA desk" />
      <Card className="flex items-start gap-3 p-6 text-plum-soft"><FlaskConical className="mt-0.5 size-5 text-amber" aria-hidden /><p>The review desk needs the backend. Connect Supabase to use it.</p></Card></div>;
  }

  const p = proposals.data ?? [];
  const waiting = p.filter(e => e.status === 'submitted' || e.status === 'under_review');
  const decided = p.filter(e => !['submitted', 'under_review'].includes(e.status));

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
            When organizers submit events for approval (added in the next stage), they’ll queue here with venue and scheduling checks.
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            {[...waiting, ...decided].map(e => (
              <Card key={e.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1 basis-72">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={waiting.includes(e) ? 'amber' : 'neutral'}>{STATUS_LABEL[e.status]}</Badge>
                    <span className="text-xs text-plum-soft">{e.club?.name} · {e.scope}</span></div>
                  <h3 className="mt-1.5 truncate text-base">{e.title}</h3>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-plum-soft">
                    <span>{longDate(e.starts_at)}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{e.venue?.name ?? 'No venue'}</span>
                    {e.submitted_at && <span>Submitted {shortDateTime(e.submitted_at)}</span>}
                  </p>
                </div>
                {waiting.includes(e) && (
                  <span title="Approve/reject run through a checked database function, added in Stage 5." className="flex gap-2">
                    <Button size="sm" disabled>Approve</Button><Button size="sm" variant="secondary" disabled>Reject</Button>
                  </span>
                )}
              </Card>
            ))}
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
    </div>
  );
}
