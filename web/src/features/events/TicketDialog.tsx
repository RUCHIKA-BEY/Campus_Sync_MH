import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import QRCode from 'qrcode';
import { motion } from 'motion/react';
import { Copy, MapPin, Clock3, X, CircleDashed, FlaskConical } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { longDate, timeRange, type CampusEvent } from '../../lib/events';
import type { DemoRegistration } from '../../lib/demo';
import { Badge } from '../../components/ui';

export function TicketDialog({ event, registration, open, onOpenChange }: {
  event: CampusEvent; registration: DemoRegistration; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const { profile } = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // A REAL, scannable QR. It holds only a random pass code (no personal
    // data, no secrets). Server-verified check-in arrives in a later stage.
    QRCode.toDataURL(`CAMPUSSYNC-DEMO|${event.id}|${registration.passCode}`, {
      margin: 1, width: 440, errorCorrectionLevel: 'M', color: { dark: '#4A2E35', light: '#FFFFFF' },
    }).then(setQr).catch(() => setQr(null));
  }, [open, event.id, registration.passCode]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(registration.passCode); setCopied('Pass code copied.'); }
    catch { setCopied('Couldn’t copy. Please copy the code manually.'); }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-plum/30 backdrop-blur-sm" />
        <Dialog.Content aria-describedby="ticket-desc"
          className="fixed top-1/2 left-1/2 z-50 max-h-[92dvh] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[28px] bg-white shadow-float focus:outline-none">
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
            <div className="relative rounded-t-[28px] bg-gradient-to-br from-plum to-plum-deep px-6 pt-6 pb-10 text-ivory">
              <Dialog.Close aria-label="Close ticket" className="absolute top-4 right-4 grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                <X className="size-4" />
              </Dialog.Close>
              <p className="text-[11px] font-extrabold tracking-[0.16em] text-blush uppercase">CampusSync pass</p>
              <Dialog.Title className="mt-2 pr-8 font-display text-xl leading-snug font-extrabold text-white">{event.title}</Dialog.Title>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-ivory/85"><MapPin className="size-4" aria-hidden />{event.venue}</p>
            </div>
            {/* Ticket "perforation" */}
            <div className="relative -mt-5 px-6">
              <div className="grid place-items-center rounded-3xl border border-line bg-white p-4 shadow-lift">
                {qr ? <img src={qr} alt={`QR code for pass ${registration.passCode}`} className="size-52" /> : <div className="size-52 animate-pulse rounded-2xl bg-mauve/60" />}
                <div className="mt-3 flex items-center gap-2">
                  <code className="rounded-lg bg-cream px-2.5 py-1 text-sm font-bold tracking-wider text-plum">{registration.passCode}</code>
                  <button type="button" onClick={copy} aria-label="Copy pass code" className="grid size-8 place-items-center rounded-lg text-plum-soft hover:bg-cream hover:text-plum">
                    <Copy className="size-4" />
                  </button>
                </div>
                <p role="status" className="mt-1 h-4 text-xs text-sage">{copied}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 px-6 pt-5 text-sm">
              <div><dt className="text-xs text-plum-muted">Attendee</dt><dd className="font-semibold">{profile?.full_name ?? 'Guest (sample mode)'}</dd></div>
              <div><dt className="text-xs text-plum-muted">Registration no.</dt><dd className="font-semibold">{profile?.registration_number ?? '—'}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-plum-muted">When</dt>
                <dd className="flex items-center gap-1.5 font-semibold"><Clock3 className="size-4 text-plum-muted" aria-hidden />{longDate(event.startsAt)} · {timeRange(event)}</dd></div>
            </dl>
            <div className="mx-6 mt-5 flex items-center justify-between rounded-2xl bg-cream px-4 py-3 text-sm">
              <span className="flex items-center gap-2 font-semibold"><CircleDashed className="size-4 text-plum-muted" aria-hidden />Venue check-in</span>
              <Badge tone="amber">Not scanned</Badge>
            </div>
            <p id="ticket-desc" className="flex items-start gap-2 px-6 pt-4 pb-6 text-xs text-plum-soft">
              <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-amber" aria-hidden />
              Demo ticket for a sample event, stored on this device. It is not valid for entry. Server-verified QR check-in is added in a later stage.
            </p>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
