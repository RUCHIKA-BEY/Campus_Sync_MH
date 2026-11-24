import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Clock3, MapPin, Sparkles } from 'lucide-react';
import { buttonClass } from '../../components/ui';
import { canRegister, longDate, registrationStatus, timeRange, type CampusEvent } from '../../lib/events';
import { BookmarkButton, OdBadge, StatusBadge } from '../events/eventUi';

/** Editorial spotlight: one lead story + two supporting stories. */
export function FeaturedSpotlight({ events, now }: { events: CampusEvent[]; now: Date }) {
  const [lead, ...rest] = events;
  if (!lead) return null;
  const leadOpen = canRegister(registrationStatus(lead, now));

  return (
    <section aria-labelledby="featured-heading" className="grid gap-5 lg:grid-cols-12">
      <h2 id="featured-heading" className="sr-only">Featured events</h2>
      <motion.article initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="group relative isolate min-h-[420px] overflow-hidden rounded-[28px] shadow-float lg:col-span-8">
        <img src={lead.image} alt="" className="absolute inset-0 -z-10 size-full object-cover transition duration-700 group-hover:scale-[1.03]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-plum-deep/90 via-plum-deep/45 to-plum-deep/5" aria-hidden />
        <div className="flex h-full flex-col justify-between p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-plum">
              <Sparkles className="size-3.5 text-terracotta" aria-hidden /> Featured · {lead.categoryName}
            </span>
            <BookmarkButton eventId={lead.id} title={lead.title} />
          </div>
          <div className="max-w-2xl text-white">
            <p className="text-sm font-semibold text-white/85">{lead.club}</p>
            <h3 className="mt-2 text-[clamp(1.7rem,3.6vw,2.6rem)] leading-[1.08] font-extrabold text-white">{lead.title}</h3>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white/90">
              <li className="flex items-center gap-1.5"><Clock3 className="size-4" aria-hidden />{longDate(lead.startsAt)} · {timeRange(lead)}</li>
              <li className="flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />{lead.venue}</li>
            </ul>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <StatusBadge event={lead} now={now} />
              {lead.odEligible && <OdBadge />}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={`/events/${lead.id}`} className={buttonClass('primary', 'lg')}>
                {leadOpen ? 'Register now' : 'View details'} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </motion.article>

      <div className="grid content-start gap-5 lg:col-span-4">
        {rest.slice(0, 2).map((e, i) => (
          <motion.article key={e.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 * (i + 1) }}
            className="group relative flex gap-4 overflow-hidden rounded-[22px] border border-line bg-white p-3 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
            <div className="relative w-32 shrink-0 overflow-hidden rounded-2xl sm:w-36">
              <img src={e.image} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />
            </div>
            <div className="flex min-w-0 flex-col py-1 pr-1">
              <p className="text-[11px] font-bold tracking-wide text-terracotta-deep uppercase">{e.categoryName}</p>
              <h3 className="mt-1 line-clamp-2 text-[15px] leading-snug font-bold">
                <Link to={`/events/${e.id}`} className="after:absolute after:inset-0 after:content-['']">{e.title}</Link>
              </h3>
              <p className="mt-1 text-xs text-plum-soft">{longDate(e.startsAt)}</p>
              <div className="mt-auto pt-2"><StatusBadge event={e} now={now} /></div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
