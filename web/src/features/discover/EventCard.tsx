import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowUpRight, Clock3, MapPin } from 'lucide-react';
import { dateParts, timeRange, type CampusEvent } from '../../lib/events';
import { BookmarkButton, DateBlock, OdBadge, StatusBadge } from '../events/eventUi';

export function EventCard({ event, now }: { event: CampusEvent; now: Date }) {
  const { weekday } = dateParts(event.startsAt);
  return (
    <motion.article layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      className="group relative flex flex-col overflow-hidden rounded-[22px] border border-line bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift focus-within:shadow-lift">
      <div className="relative aspect-[16/10] overflow-hidden">
        <img src={event.image} alt="" loading="lazy" decoding="async"
             className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" />
        <div className="absolute inset-0 bg-gradient-to-t from-plum-deep/45 via-transparent to-transparent" aria-hidden />
        <span className="absolute top-3 left-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-plum shadow-soft">{event.categoryName}</span>
        <BookmarkButton eventId={event.id} title={event.title} className="absolute top-3 right-3 z-10" />
        <DateBlock iso={event.startsAt} className="absolute -bottom-5 left-4 z-10" />
      </div>

      <div className="flex flex-1 flex-col px-5 pt-8 pb-5">
        <p className="text-xs font-bold text-plum-soft">{event.club}</p>
        <h3 className="mt-1 line-clamp-2 text-[17px] leading-snug font-bold">
          {/* The link's ::after covers the whole card, so the card is one big target. */}
          <Link to={`/events/${event.id}`} className="after:absolute after:inset-0 after:content-[''] focus:outline-none">
            {event.title}
          </Link>
        </h3>
        <ul className="mt-3 grid gap-1.5 text-[13px] text-plum-soft">
          <li className="flex items-center gap-2"><Clock3 className="size-3.5 shrink-0 text-plum-muted" aria-hidden />{weekday} · {timeRange(event)}</li>
          <li className="flex items-center gap-2"><MapPin className="size-3.5 shrink-0 text-plum-muted" aria-hidden /><span className="truncate">{event.venue}</span></li>
        </ul>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          <StatusBadge event={event} now={now} />
          {event.odEligible && <OdBadge />}
          <span className="ml-auto inline-flex items-center gap-1 text-[13px] font-bold text-terracotta-deep">
            Details <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </motion.article>
  );
}
