// Check-in desk for one event: open/close a time-limited session, scan
// passes (camera or typed), and manage the roster (manual mark / revoke).
import { Suspense, lazy, useCallback, useState, type FormEvent } from 'react';
import { Camera, CircleCheck, CircleX, DoorClosed, DoorOpen, UserCheck } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { ReasonDialog } from '../../components/ReasonDialog';
import { Badge, Button, FormStatus, Input, Select, Skeleton, cx } from '../../components/ui';
import { useToast } from '../../components/Toaster';
import { friendlyError } from '../../lib/errors';
import { useCheckIn, useCloseSession, useEventAttendance, useMarkManual, useOpenSession, useRevokeAttendance, type AttendanceRow } from '../../lib/od';
// The QR decoder (~130 kB) is downloaded only when scanning starts.
const QrScanner = lazy(() => import('./QrScanner').then(m => ({ default: m.QrScanner })));

const hhmm = (iso: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

export function AttendanceDialog({ eventId, title, onClose }: { eventId: string; title: string; onClose: () => void }) {
  const [sessionLive, setSessionLive] = useState(false);
  const roster = useEventAttendance(eventId, sessionLive);
  const openS = useOpenSession();
  const closeS = useCloseSession();
  const checkIn = useCheckIn();
  const toast = useToast();
  const [minutes, setMinutes] = useState('120');
  const [scanning, setScanning] = useState(false);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const rows = roster.data ?? [];
  const sessionId = rows[0]?.open_session_id ?? null;
  const closesAt = rows[0]?.session_closes_at ?? null;
  if (Boolean(sessionId) !== sessionLive) setSessionLive(Boolean(sessionId));
  const registered = rows.filter(r => r.registration_status === 'registered');
  const present = registered.filter(r => r.checked_in_at && r.verification_status === 'verified');

  const submitCode = useCallback((code: string) => {
    setResult(null);
    checkIn.mutate({ eventId, code: code.trim() }, {
      onSuccess: r => { setResult({ ok: true, text: `${r.student_name}${r.registration_number ? ` · ${r.registration_number}` : ''}` }); setTyped(''); },
      onError: e => setResult({ ok: false, text: friendlyError(e) }),
    });
  }, [checkIn, eventId]);

  return (
    <Modal wide open onOpenChange={o => !o && onClose()} title={`Check-in: ${title}`}
           description={roster.data ? `${present.length} of ${registered.length} registered students checked in` : undefined}>
      <div className="grid gap-5">
        {/* Session control */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream p-4">
          {sessionId ? (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-sage"><DoorOpen className="size-4" aria-hidden />Check-in open until {closesAt && hhmm(closesAt)}</p>
              <Button size="sm" variant="secondary" loading={closeS.isPending}
                onClick={() => closeS.mutate(sessionId, { onSuccess: () => { setScanning(false); toast('Check-in closed.'); }, onError: e => toast(friendlyError(e), 'error') })}>
                <DoorClosed className="size-4" />Close check-in
              </Button>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm text-plum-soft"><DoorClosed className="size-4" aria-hidden />Check-in is closed. Passes are refused until you open it.</p>
              <div className="flex items-center gap-2">
                <Select aria-label="Session length" value={minutes} onChange={e => setMinutes(e.target.value)} className="h-9 min-h-0 w-auto text-sm">
                  <option value="60">1 hour</option><option value="120">2 hours</option><option value="180">3 hours</option>
                </Select>
                <Button size="sm" loading={openS.isPending}
                  onClick={() => openS.mutate({ eventId, minutes: Number(minutes) }, { onSuccess: () => toast('Check-in opened.', 'success'), onError: e => toast(friendlyError(e), 'error') })}>
                  <DoorOpen className="size-4" />Open check-in
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Scanner */}
        {sessionId && (
          <div className="grid gap-3">
            {scanning ? <Suspense fallback={<Skeleton className="aspect-[4/3] w-full rounded-2xl" />}><QrScanner onCode={submitCode} paused={checkIn.isPending} /></Suspense>
              : <Button variant="plum" onClick={() => setScanning(true)}><Camera className="size-4" />Scan passes with camera</Button>}
            <form className="flex gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); if (typed.trim()) submitCode(typed); }}>
              <Input aria-label="Pass code" placeholder="…or type the pass code" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
              <Button type="submit" variant="secondary" loading={checkIn.isPending}>Check in</Button>
            </form>
            {result && (
              <p role="status" className={cx('flex items-center gap-2 rounded-2xl px-4 py-3 text-base font-bold', result.ok ? 'bg-sage-bg text-sage' : 'bg-peach text-terracotta-deep')}>
                {result.ok ? <CircleCheck className="size-5" aria-hidden /> : <CircleX className="size-5" aria-hidden />}
                {result.ok ? `Checked in: ${result.text}` : result.text}
              </p>
            )}
            {result?.ok && <p className="-mt-1 text-xs text-plum-muted">Check the name against the person in front of you.</p>}
          </div>
        )}

        {/* Roster */}
        {roster.isError ? <FormStatus kind="error">{friendlyError(roster.error)}</FormStatus>
          : roster.isPending ? <Skeleton className="h-40" />
          : !registered.length ? <p className="text-sm text-plum-soft">No one is registered yet.</p>
          : (
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {registered.map(r => <RosterRow key={r.registration_id} r={r} />)}
            </ul>
          )}
      </div>
    </Modal>
  );
}

function RosterRow({ r }: { r: AttendanceRow }) {
  const mark = useMarkManual();
  const revoke = useRevokeAttendance();
  const toast = useToast();
  const [revoking, setRevoking] = useState(false);
  const present = r.checked_in_at && r.verification_status === 'verified';
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate font-semibold">{r.full_name}</p>
        <p className="text-xs text-plum-soft">{[r.registration_number, r.department_code].filter(Boolean).join(' · ') || '—'}</p>
      </div>
      {present ? (
        <>
          <Badge tone="sage" icon={<UserCheck className="size-3" />}>{hhmm(r.checked_in_at!)} · {r.method === 'qr' ? 'QR' : 'manual'}</Badge>
          <Button size="sm" variant="ghost" onClick={() => setRevoking(true)}>Revoke</Button>
        </>
      ) : r.verification_status === 'revoked' ? (
        <Badge tone="muted">Revoked</Badge>
      ) : (
        <Button size="sm" variant="secondary" loading={mark.isPending}
          onClick={() => mark.mutate(r.registration_id, { onSuccess: () => toast(`${r.full_name} marked present (manual).`, 'success'), onError: e => toast(friendlyError(e), 'error') })}>
          Mark present
        </Button>
      )}
      {revoking && (
        <ReasonDialog title={`Revoke attendance for ${r.full_name}?`} label="Reason (kept in the audit log)" confirmLabel="Revoke" onClose={() => setRevoking(false)}
          onConfirm={async reason => {
            try { await revoke.mutateAsync({ registrationId: r.registration_id, reason }); toast('Attendance revoked.'); }
            catch (e) { throw new Error(friendlyError(e)); }
          }} />
      )}
    </li>
  );
}
