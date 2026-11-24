import { useMemo, useState, type FormEvent } from 'react';
import { CalendarPlus, FilePen, Send, Trash2, Users, FileText, Clock3, CheckCircle2, MapPin, FlaskConical } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Button, Card, EmptyState, Field, FormStatus, Input, PageHeader, Select, Skeleton } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { StatCard } from '../../components/StatCard';
import { useToast } from '../../components/Toaster';
import { isConfigured } from '../../lib/env';
import { friendlyError } from '../../lib/errors';
import { longDate, shortDateTime } from '../../lib/events';
import { useCategories } from '../../lib/queries';
import { isoFromIstInput, istInputFromIso } from '../../lib/time';
import {
  EVENT_TYPES, STATUS_LABEL, useClubEvents, useDeleteDraft, useManagedClubs, useSaveDraft, useVenues, validateDraft,
  type DraftInput, type EventScope, type EventStatus, type EventType, type ManagedClub, type OrgEvent,
} from '../../lib/organizer';

const STATUS_TONE: Record<EventStatus, Parameters<typeof Badge>[0]['tone']> = {
  draft: 'muted', submitted: 'amber', under_review: 'amber', changes_requested: 'terracotta', approved: 'sage',
  rejected: 'terracotta', published: 'sage', completed: 'neutral', cancelled: 'muted',
};
const EDITABLE: EventStatus[] = ['draft', 'changes_requested'];

export function OrganizerPage() {
  const { profile } = useAuth();
  const clubs = useManagedClubs();
  const clubIds = useMemo(() => (clubs.data ?? []).map(c => c.id), [clubs.data]);
  const events = useClubEvents(clubIds);
  const [editing, setEditing] = useState<OrgEvent | 'new' | null>(null);

  if (!isConfigured) {
    return <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6"><PageHeader kicker="Organizer workspace" title="Organizer console" />
      <Card className="flex items-start gap-3 p-6 text-plum-soft"><FlaskConical className="mt-0.5 size-5 text-amber" aria-hidden /><p>Event management needs the backend. Connect Supabase to use it.</p></Card></div>;
  }

  const list = events.data ?? [];
  const count = (s: EventStatus[]) => list.filter(e => s.includes(e.status)).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <PageHeader kicker="Organizer workspace" title={`Hello, ${profile?.full_name.split(' ')[0] ?? 'organizer'}.`}
        actions={clubIds.length > 0 && <Button onClick={() => setEditing('new')}><CalendarPlus className="size-4" />New event draft</Button>}>
        Draft events for your clubs. Submitting for DSA approval arrives in the next stage.
      </PageHeader>

      {clubs.isError ? <FormStatus kind="error">{friendlyError(clubs.error)}</FormStatus>
        : clubs.isPending ? <Skeleton className="h-40" />
        : clubIds.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title="You don’t manage a club yet">
            An admin needs to add you as a <strong>lead</strong> or <strong>coordinator</strong> of a club (Admin → Club leads). Until then the database won’t let you create events, by design.
          </EmptyState>
        ) : (
          <>
            <div className="mb-8 flex flex-wrap gap-2">
              {clubs.data!.map(c => <Badge key={c.id} tone="plum" className="px-3 py-1.5 text-xs">{c.name} · {c.membership_role}</Badge>)}
            </div>
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Drafts" value={count(['draft'])} icon={FilePen} loading={events.isPending} />
              <StatCard label="Awaiting review" value={count(['submitted', 'under_review'])} icon={Clock3} loading={events.isPending} />
              <StatCard label="Needs changes" value={count(['changes_requested', 'rejected'])} icon={FileText} loading={events.isPending} />
              <StatCard label="Approved / published" value={count(['approved', 'published'])} icon={CheckCircle2} loading={events.isPending} />
            </div>

            {events.isError ? <FormStatus kind="error">{friendlyError(events.error)}</FormStatus>
              : events.isPending ? <Skeleton className="h-48" />
              : list.length === 0 ? (
                <EmptyState icon={<CalendarPlus className="size-6" />} title="No events yet"
                  action={<Button onClick={() => setEditing('new')}><CalendarPlus className="size-4" />Create your first draft</Button>}>
                  Drafts are private to your club until you submit them.
                </EmptyState>
              ) : (
                <div className="grid gap-3">
                  {list.map(e => <EventRow key={e.id} event={e} clubName={clubs.data!.find(c => c.id === e.club_id)?.name} onEdit={() => setEditing(e)} />)}
                </div>
              )}
          </>
        )}

      {editing && clubs.data && (
        <DraftDialog key={editing === 'new' ? 'new' : editing.id} event={editing === 'new' ? null : editing} clubs={clubs.data} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function EventRow({ event, clubName, onEdit }: { event: OrgEvent; clubName?: string; onEdit: () => void }) {
  const remove = useDeleteDraft();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const editable = EDITABLE.includes(event.status);
  return (
    <Card className="flex flex-wrap items-center gap-4 p-4">
      <div className="min-w-0 flex-1 basis-72">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[event.status]}>{STATUS_LABEL[event.status]}</Badge>
          {event.od_eligible && <Badge tone="terracotta">OD eligible</Badge>}
          <span className="text-xs text-plum-soft">{clubName} · {event.category?.name}</span>
        </div>
        <h3 className="mt-1.5 truncate text-base">{event.title}</h3>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-plum-soft">
          <span>{longDate(event.starts_at)}, {shortDateTime(event.starts_at).split(', ')[1]}</span>
          <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{event.venue?.name ?? 'No venue yet'}</span>
          <span>Capacity {event.capacity}</span>
        </p>
        {event.review_note && <p className="mt-2 rounded-xl bg-peach px-3 py-2 text-xs text-terracotta-deep"><strong>DSA note:</strong> {event.review_note}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {editable && <Button variant="secondary" size="sm" onClick={onEdit}><FilePen className="size-4" />Edit</Button>}
        {event.status === 'draft' && (confirm ? (
          <>
            <Button variant="plum" size="sm" loading={remove.isPending} onClick={() => remove.mutate(event.id, { onSuccess: () => toast('Draft deleted.'), onError: e => toast(friendlyError(e), 'error') })}>Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>Keep</Button>
          </>
        ) : <Button variant="ghost" size="sm" onClick={() => setConfirm(true)} aria-label={`Delete ${event.title}`}><Trash2 className="size-4" /></Button>)}
        {editable && (
          <span title="Submitting goes through a checked database function, added in Stage 5.">
            <Button size="sm" disabled><Send className="size-4" />Submit for approval</Button>
          </span>
        )}
      </div>
    </Card>
  );
}

function DraftDialog({ event, clubs, onClose }: { event: OrgEvent | null; clubs: ManagedClub[]; onClose: () => void }) {
  const categories = useCategories();
  const venues = useVenues();
  const save = useSaveDraft();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    club_id: event?.club_id ?? clubs[0]!.id, title: event?.title ?? '', description: event?.description ?? '',
    category_id: event?.category_id ?? '', event_type: (event?.event_type ?? 'workshop') as EventType, scope: (event?.scope ?? 'club') as EventScope,
    venue_id: event?.venue_id ?? '', starts: event ? istInputFromIso(event.starts_at) : '', ends: event ? istInputFromIso(event.ends_at) : '',
    opens: event ? istInputFromIso(event.registration_opens_at) : '', closes: event ? istInputFromIso(event.registration_closes_at) : '',
    capacity: String(event?.capacity ?? 50), od_eligible: event?.od_eligible ?? false,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));
  const venue = venues.data?.find(v => v.id === f.venue_id);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!f.category_id) return setError('Choose a category.');
    if (!f.starts || !f.ends || !f.opens || !f.closes) return setError('Fill in all dates and times.');
    const input: DraftInput = {
      club_id: f.club_id, title: f.title.trim(), description: f.description.trim(), category_id: f.category_id,
      event_type: f.event_type, scope: f.scope, venue_id: f.venue_id || null,
      starts_at: isoFromIstInput(f.starts), ends_at: isoFromIstInput(f.ends),
      registration_opens_at: isoFromIstInput(f.opens), registration_closes_at: isoFromIstInput(f.closes),
      capacity: Number(f.capacity), od_eligible: f.od_eligible,
    };
    const problem = validateDraft(input, venue?.capacity);
    if (problem) return setError(problem);
    save.mutate({ id: event?.id, input }, {
      onSuccess: () => { toast(event ? 'Draft updated.' : 'Draft saved.', 'success'); onClose(); },
      onError: err => setError(friendlyError(err)),
    });
  };

  return (
    <Modal wide open onOpenChange={o => !o && onClose()} title={event ? 'Edit event draft' : 'New event draft'}
           description="All times are campus time (IST). Drafts don’t reserve the venue; it is checked again when you submit.">
      <form method="post" noValidate onSubmit={onSubmit} className="grid gap-4">
        <Field label="Title"><Input value={f.title} onChange={set('title')} maxLength={150} placeholder="e.g. Design Thinking Sprint" /></Field>
        <Field label="Description">
          <textarea value={f.description} onChange={set('description')} rows={4} maxLength={5000}
            className="w-full rounded-xl border border-line bg-field px-3.5 py-2.5 text-base text-plum focus:border-plum focus:bg-white focus:outline-none focus:ring-3 focus:ring-plum/10" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          {clubs.length > 1 && <Field label="Club"><Select value={f.club_id} onChange={set('club_id')}>{clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
          <Field label="Category">
            <Select value={f.category_id} onChange={set('category_id')}>
              <option value="">Choose…</option>{categories.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Type"><Select value={f.event_type} onChange={set('event_type')}>{EVENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Scope">
            <Select value={f.scope} onChange={set('scope')}>
              <option value="club">Club</option><option value="department">Department</option><option value="university">University-wide</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Venue" hint={venue ? `Holds ${venue.capacity}` : 'Optional for drafts, required to submit'}>
            <Select value={f.venue_id} onChange={set('venue_id')}>
              <option value="">Not decided yet</option>{venues.data?.map(v => <option key={v.id} value={v.id}>{v.name}{v.building ? ` · ${v.building}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Capacity"><Input type="number" min={1} inputMode="numeric" value={f.capacity} onChange={set('capacity')} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts"><Input type="datetime-local" value={f.starts} onChange={set('starts')} /></Field>
          <Field label="Ends"><Input type="datetime-local" value={f.ends} onChange={set('ends')} /></Field>
          <Field label="Registration opens"><Input type="datetime-local" value={f.opens} onChange={set('opens')} /></Field>
          <Field label="Registration closes"><Input type="datetime-local" value={f.closes} onChange={set('closes')} /></Field>
        </div>
        <label className="flex items-center gap-3 rounded-xl border border-line bg-cream px-4 py-3 text-sm font-semibold">
          <input type="checkbox" checked={f.od_eligible} onChange={e => setF(p => ({ ...p, od_eligible: e.target.checked }))} className="size-4 accent-terracotta" />
          On-Duty eligible (students may request OD if it clashes with classes)
        </label>
        <FormStatus kind="error">{error}</FormStatus>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending} loadingLabel="Saving…">{event ? 'Save draft' : 'Create draft'}</Button>
        </div>
      </form>
    </Modal>
  );
}
