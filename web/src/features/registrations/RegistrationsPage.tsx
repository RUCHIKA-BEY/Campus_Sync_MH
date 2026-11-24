import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Bookmark, CalendarCheck2, History, Ticket } from 'lucide-react';
import { EmptyState, PageHeader, buttonClass, cx } from '../../components/ui';
import { SAMPLE_EVENTS, longDate, timeRange, type CampusEvent } from '../../lib/events';
import { usePublicEvents } from '../../lib/publicEvents';
import { useDemoRegistrations, useSavedEvents } from '../../lib/demo';
import { useMyRegistrations } from '../../lib/registration';
import { Badge } from '../../components/ui';
import { SampleNotice, StatusBadge, useNow } from '../events/eventUi';
import { TicketDialog } from '../events/TicketDialog';

type Tab = 'upcoming' | 'past' | 'saved';
/** One row: a real registration (database) or a demo one (this device). */
interface Entry { event: CampusEvent; reg?: { passCode: string }; demo: boolean }

export function RegistrationsPage() {
  const now = useNow();
  const { regs } = useDemoRegistrations();
  const { savedIds } = useSavedEvents();
  const [tab, setTab] = useState<Tab>('upcoming');
  const realEvents = usePublicEvents().data;
  const myRegs = useMyRegistrations();
  const [ticket, setTicket] = useState<Entry | null>(null);

  const lists = useMemo(() => {
    const all = [...SAMPLE_EVENTS, ...(realEvents ?? [])];
    const byId = new Map(all.map(e => [e.id, e]));
    const real: Entry[] = (myRegs.data ?? []).map(r => ({ event: r.event, reg: { passCode: r.pass_code }, demo: false }));
    const demoEntries: Entry[] = regs.flatMap(r => { const event = byId.get(r.eventId); return event ? [{ event, reg: { passCode: r.passCode }, demo: true }] : []; });
    const registered = [...real, ...demoEntries];
    const regFor = (id: string) => registered.find(x => x.event.id === id);
    const t = now.getTime();
    return {
      upcoming: registered.filter(x => Date.parse(x.event.endsAt) > t).sort((a, b) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt)),
      past: registered.filter(x => Date.parse(x.event.endsAt) <= t),
      saved: all.filter(e => savedIds.has(e.id)).map((event): Entry => regFor(event.id) ?? { event, demo: event.isSample }),
    };
  }, [regs, savedIds, now, realEvents, myRegs.data]);

  const tabs: Array<{ id: Tab; label: string; icon: typeof Ticket }> = [
    { id: 'upcoming', label: 'Upcoming', icon: CalendarCheck2 },
    { id: 'past', label: 'Past', icon: History },
    { id: 'saved', label: 'Saved', icon: Bookmark },
  ];
  const current = lists[tab];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader kicker="Your activity" title="My events" actions={<Link to="/discover" className={buttonClass('primary')}>Find more events</Link>}>
        Everything you’ve said yes to, in one calm place.
      </PageHeader>
      {regs.length > 0 && <SampleNotice className="mb-6" />}

      <div role="tablist" aria-label="My events" className="mb-6 inline-flex rounded-2xl border border-line bg-white p-1 shadow-soft">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                  className={cx('relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold', tab === t.id ? 'text-ivory' : 'text-plum-soft hover:text-plum')}>
            {tab === t.id && <motion.span layoutId="reg-tab" className="absolute inset-0 rounded-xl bg-plum" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <t.icon className="relative size-4" aria-hidden />
            <span className="relative">{t.label}</span>
            <span className={cx('relative rounded-md px-1.5 text-xs', tab === t.id ? 'bg-white/15' : 'bg-cream')}>{lists[t.id].length}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {current.length === 0 ? (
            <motion.div key={`empty-${tab}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <EmptyState icon={<Ticket className="size-6" />} title={tab === 'saved' ? 'No saved events' : tab === 'past' ? 'No past events yet' : 'No upcoming registrations'}
                          action={<Link to="/discover" className={buttonClass('secondary')}>Explore events</Link>}>
                {tab === 'saved' ? 'Bookmark events on Discover to keep them here.' : 'Register for an event and your ticket will appear here.'}
              </EmptyState>
            </motion.div>
          ) : current.map(({ event, reg, demo }) => (
            <motion.article key={`${tab}-${event.id}`} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-col gap-4 rounded-[22px] border border-line bg-white p-3 shadow-soft sm:flex-row sm:items-center sm:p-4">
              <img src={event.image} alt="" className="h-36 w-full rounded-2xl object-cover sm:h-24 sm:w-36" loading="lazy" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-xs font-bold text-terracotta-deep">{event.categoryName} · {event.club}{demo && reg && <Badge tone="amber">Demo</Badge>}</p>
                <h3 className="mt-1 truncate text-lg"><Link to={`/events/${event.id}`} className="hover:underline">{event.title}</Link></h3>
                <p className="mt-1 text-sm text-plum-soft">{longDate(event.startsAt)} · {timeRange(event)} · {event.venue}</p>
                <div className="mt-2"><StatusBadge event={event} now={now} /></div>
              </div>
              <div className="flex gap-2 sm:flex-col">
                {reg ? <button onClick={() => setTicket({ event, reg, demo })} className={buttonClass('primary', 'sm')}><Ticket className="size-4" />View ticket</button>
                     : <Link to={`/events/${event.id}`} className={buttonClass('secondary', 'sm')}>Details</Link>}
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>

      {ticket?.reg && <TicketDialog demo={ticket.demo} event={ticket.event} registration={ticket.reg} open onOpenChange={o => !o && setTicket(null)} />}
    </div>
  );
}
