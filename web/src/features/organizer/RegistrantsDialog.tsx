// Registrants for one event, via get_event_registrants(): name, registration
// number, department, year and the conflict snapshot. Never email/phone.
import { Users } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Badge, EmptyState, FormStatus, Skeleton } from '../../components/ui';
import { friendlyError } from '../../lib/errors';
import { CONFLICT_LABEL, useRegistrants, type ConflictStatus } from '../../lib/registration';
import { shortDateTime } from '../../lib/events';

const TONE: Record<ConflictStatus, Parameters<typeof Badge>[0]['tone']> = {
  no_conflict: 'sage', partial_conflict: 'amber', full_conflict: 'terracotta', timetable_not_configured: 'muted',
};

export function RegistrantsDialog({ eventId, title, capacity, onClose }: { eventId: string; title: string; capacity: number; onClose: () => void }) {
  const q = useRegistrants(eventId);
  const active = q.data?.filter(r => r.status === 'registered') ?? [];
  return (
    <Modal wide open onOpenChange={o => !o && onClose()} title={`Registrants: ${title}`}
           description={q.data ? `${active.length} of ${capacity} places taken` : undefined}>
      {q.isError ? <FormStatus kind="error">{friendlyError(q.error)}</FormStatus>
        : q.isPending ? <Skeleton className="h-40" />
        : !q.data.length ? <EmptyState icon={<Users className="size-6" />} title="No registrations yet" />
        : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {q.data.map(r => (
              <li key={r.registration_id} className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${r.status === 'cancelled' ? 'opacity-55' : ''}`}>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-semibold">{r.full_name}</p>
                  <p className="text-xs text-plum-soft">{[r.registration_number, r.department_code, r.academic_year && `Year ${r.academic_year}`].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                <Badge tone={TONE[r.conflict_status]}>{CONFLICT_LABEL[r.conflict_status]}</Badge>
                {r.status === 'cancelled' && <Badge tone="muted">Cancelled</Badge>}
                <span className="text-xs text-plum-muted">{shortDateTime(r.registered_at)}</span>
              </li>
            ))}
          </ul>
        )}
    </Modal>
  );
}
