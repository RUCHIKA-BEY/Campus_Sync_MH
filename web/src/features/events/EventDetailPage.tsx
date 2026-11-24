import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { motion } from 'motion/react';
import { ArrowLeft, CalendarClock, CalendarRange, MapPin, Ticket, UsersRound, BadgeCheck, CalendarX2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Button, Card, Kicker, buttonClass } from '../../components/ui';
import { useToast } from '../../components/Toaster';
import { isConfigured } from '../../lib/env';
import { canRegister, longDate, registrationStatus, seatsLeft, shortDateTime, statusLabel, timeRange } from '../../lib/events';
import { useEventById } from '../../lib/publicEvents';
import { Skeleton } from '../../components/ui';
import { useDemoRegistrations } from '../../lib/demo';
import { friendlyError } from '../../lib/errors';
import { CONFLICT_LABEL, useCancelRegistration, useMyRegistrations, useRegister } from '../../lib/registration';
import { CanIAttend } from './CanIAttend';
import { BookmarkButton, OdBadge, SampleNotice, StatusBadge, useNow } from './eventUi';
import { TicketDialog } from './TicketDialog';

export function EventDetailPage() {
  const { id } = useParams();
  const { event, isLoading } = useEventById(id);
  const now = useNow();
  const { session, profile } = useAuth();
  const myRegs = useMyRegistrations();
  const register = useRegister();
  const cancelReg = useCancelRegistration();
  const [freshPass, setFreshPass] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const demo = useDemoRegistrations();
  const [ticketOpen, setTicketOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (isLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6"><Skeleton className="h-72 rounded-[28px]" /><Skeleton className="mt-6 h-10 w-2/3" /></div>;
  }
  if (!event) {
    return (
      <div className="mx-auto grid max-w-xl place-items-center gap-4 px-4 py-24 text-center">
        <CalendarX2 className="size-10 text-terracotta" aria-hidden />
        <h1 className="text-2xl font-extrabold">Event not found</h1>
        <p className="text-plum-soft">It may have been removed or the link is incorrect.</p>
        <Link to="/discover" className={buttonClass('primary')}>Browse events</Link>
      </div>
    );
  }

  const status = registrationStatus(event, now);
  const registration = demo.find(event.id);                       // sample events (on this device)
  const realReg = myRegs.data?.find(r => r.event.id === event.id); // real events (database)
  const realPass = realReg?.pass_code ?? freshPass;
  const isStudent = profile?.role === 'student';
  const canCancelReal = Date.parse(event.registrationClosesAt) > now.getTime();
  // Seat counts are unknown for real events until registration exists (Stage 6).
  const fill = event.registeredCount === null ? null : Math.min(100, Math.round((event.registeredCount / event.capacity) * 100));
  const left = seatsLeft(event);

  const onRegister = () => {
    if (isConfigured && !session) {
      toast('Sign in to register for events.', 'info');
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    demo.register(event.id);
    toast('Demo registration saved on this device.', 'success');
    setTicketOpen(true);
  };

  const onRegisterReal = () => {
    if (!session) {
      toast('Sign in to register for events.', 'info');
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    // The database re-checks everything (status, window, duplicates,
    // capacity with a row lock, timetable) and returns the conflict result.
    register.mutate(event.id, {
      onSuccess: r => {
        setFreshPass(r.pass_code);
        toast(`You’re registered. ${CONFLICT_LABEL[r.conflict.status]}.`, 'success');
        setTicketOpen(true);
      },
      onError: e => toast(friendlyError(e), 'error'),
    });
  };

  return (
    <div className="pb-16">
      {/* Hero */}
      <div className="relative isolate h-[min(52vh,440px)] overflow-hidden">
        <motion.img initial={{ scale: 1.06 }} animate={{ scale: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }}
                    src={event.image} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
        {/* Fade the photo into the ivory canvas so the title below stays readable. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ivory from-20% via-ivory/75 via-45% to-plum-deep/25" aria-hidden />
        <div className="mx-auto flex h-full max-w-6xl items-start justify-between px-4 pt-5 sm:px-6">
          <Link to="/discover" className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-sm font-semibold shadow-soft hover:bg-white">
            <ArrowLeft className="size-4" aria-hidden /> All events
          </Link>
          <BookmarkButton eventId={event.id} title={event.title} />
        </div>
      </div>

      <div className="relative mx-auto -mt-28 grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <Kicker>{event.categoryName} · {event.club}</Kicker>
          <h1 className="mt-3 text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] font-extrabold">{event.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge event={event} now={now} />
            {event.odEligible && <OdBadge />}
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              [CalendarClock, 'Date & time', `${longDate(event.startsAt)}`, timeRange(event)],
              [MapPin, 'Venue', event.venue, `${event.scope === 'university' ? 'University-wide' : event.scope === 'department' ? 'Department' : 'Club'} event`],
              [CalendarRange, 'Registration window', `Opens ${shortDateTime(event.registrationOpensAt)}`, `Closes ${shortDateTime(event.registrationClosesAt)}`],
              [UsersRound, 'Capacity', event.registeredCount === null ? `${event.capacity} places` : `${event.registeredCount} / ${event.capacity} registered`, left === null ? 'Live seat count arrives with registration' : `${left} seats left`],
            ].map(([Icon, label, a, b]) => {
              const I = Icon as typeof MapPin;
              return (
                <Card key={label as string} className="flex gap-3 p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-peach text-terracotta"><I className="size-5" aria-hidden /></span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-plum-muted">{label as string}</p>
                    <p className="font-semibold">{a as string}</p>
                    <p className="text-sm text-plum-soft">{b as string}</p>
                  </div>
                </Card>
              );
            })}
          </div>

          <section className="mt-8">
            <h2 className="text-xl font-bold">About this event</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-plum-soft">{event.description}</p>
          </section>

          {event.odEligible && (
            <section className="mt-6 flex gap-3 rounded-2xl border border-terracotta/20 bg-peach p-4 text-sm">
              <BadgeCheck className="size-5 shrink-0 text-terracotta" aria-hidden />
              <p><strong>On-Duty eligible.</strong> If this event clashes with your classes, you can request On-Duty after registering{event.isSample ? '' : ' (the request form arrives in the next stage)'}.</p>
            </section>
          )}
          {event.lifecycle === 'cancelled' && (
            <p className="mt-6 rounded-2xl border border-line bg-cream p-4 text-sm"><strong>This event was cancelled.</strong> {event.cancellationReason}</p>
          )}
          {event.isSample && <SampleNotice className="mt-6" />}
        </div>

        {/* Sticky action card */}
        <aside className="lg:pt-24">
          <Card className="sticky top-24 p-5 shadow-lift">
            {fill !== null && (<>
            <p className="text-sm font-semibold text-plum-soft">Seats</p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-mauve" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fill} aria-label="Seats filled">
              <motion.div initial={{ width: 0 }} animate={{ width: `${fill}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                          className="h-full rounded-full bg-gradient-to-r from-terracotta to-terracotta-deep" />
            </div>
            </>)}
            <p className="mt-2 text-sm text-plum-soft">{statusLabel(status, event)}</p>

            {!event.isSample && session && isStudent && event.lifecycle === 'published' && Date.parse(event.endsAt) > now.getTime() && (
              <div className="mt-4"><p className="mb-2 text-xs font-bold tracking-wide text-plum-muted uppercase">Can I attend?</p><CanIAttend eventId={event.id} /></div>
            )}

            <div className="mt-5 grid gap-2.5">
              {event.isSample ? (
                registration ? (
                  <>
                    <p className="rounded-xl bg-sage-bg px-3 py-2 text-sm font-semibold text-sage">✓ You’re registered (demo)</p>
                    <Button onClick={() => setTicketOpen(true)} size="lg"><Ticket className="size-4" />View ticket</Button>
                    {confirmCancel ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep</Button>
                        <Button variant="plum" onClick={() => { demo.cancel(event.id); setConfirmCancel(false); toast('Demo registration cancelled.'); }}>Yes, cancel</Button>
                      </div>
                    ) : <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel registration</Button>}
                  </>
                ) : canRegister(status) ? <Button size="lg" onClick={onRegister}>Register now (demo)</Button>
                  : <Button size="lg" disabled>{statusLabel(status, event)}</Button>
              ) : realPass ? (
                <>
                  <p className="rounded-xl bg-sage-bg px-3 py-2 text-sm font-semibold text-sage">✓ You’re registered</p>
                  <Button onClick={() => setTicketOpen(true)} size="lg"><Ticket className="size-4" />View ticket</Button>
                  {canCancelReal && (confirmCancel ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep</Button>
                      <Button variant="plum" loading={cancelReg.isPending} onClick={() => cancelReg.mutate(event.id, {
                        onSuccess: () => { setConfirmCancel(false); setFreshPass(null); toast('Registration cancelled. Your seat was released.'); },
                        onError: e => toast(friendlyError(e), 'error'),
                      })}>Yes, cancel</Button>
                    </div>
                  ) : <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel registration</Button>)}
                </>
              ) : !canRegister(status) ? (
                // Never show an action that can't succeed.
                <Button size="lg" disabled>{statusLabel(status, event)}</Button>
              ) : session && !isStudent ? (
                <Button size="lg" disabled>Only students register for events</Button>
              ) : (
                <Button size="lg" onClick={onRegisterReal} loading={register.isPending} loadingLabel="Registering…">
                  {session ? 'Register now' : 'Sign in to register'}
                </Button>
              )}
            </div>
            {event.isSample && <p className="mt-4 text-xs text-plum-muted">Sample event: no timetable check. Real events show your “Can I attend?” result here.</p>}
          </Card>
        </aside>
      </div>

      {event.isSample && registration && <TicketDialog event={event} registration={registration} open={ticketOpen} onOpenChange={setTicketOpen} />}
      {!event.isSample && realPass && <TicketDialog demo={false} event={event} registration={{ passCode: realPass }} open={ticketOpen} onOpenChange={setTicketOpen} />}
    </div>
  );
}
