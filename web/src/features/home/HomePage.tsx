import { useMemo } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, CalendarCheck2, Compass, QrCode, BadgeCheck, Sparkles } from 'lucide-react';
import { Kicker, buttonClass } from '../../components/ui';
import { longDate, timeRange } from '../../lib/events';
import { useEventFeed } from '../../lib/publicEvents';
import { StatusBadge, useNow } from '../events/eventUi';
import { EventCard } from '../discover/EventCard';

const INTERESTS = [
  ['technology', 'Technology'], ['hackathons', 'Hackathons'], ['entrepreneurship', 'Entrepreneurship'],
  ['arts-culture', 'Arts & Culture'], ['music', 'Music'], ['research', 'Research'], ['community', 'Community'],
] as const;

export function HomePage() {
  const now = useNow();
  const feed = useEventFeed();
  const upcoming = useMemo(() => feed.events.filter(e => e.lifecycle === 'published' && Date.parse(e.endsAt) > now.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)), [feed.events, now]);
  const hero = upcoming.find(e => e.featured) ?? upcoming[0];

  return (
    <>
      <section className="ambient overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16 lg:pb-24">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-bold text-terracotta-deep shadow-soft">
              <Sparkles className="size-3.5" aria-hidden /> Academic timetable & event coordination
            </span>
            <h1 className="mt-6 text-[clamp(2.6rem,7vw,5.2rem)] leading-[0.95] font-extrabold tracking-[-0.045em]">
              Your campus is full of <span className="relative whitespace-nowrap text-terracotta">possibilities.
                <svg viewBox="0 0 300 14" className="absolute -bottom-2 left-0 w-full text-terracotta/35" preserveAspectRatio="none" aria-hidden>
                  <path d="M2 10 C 80 2, 220 2, 298 9" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-lg text-plum-soft">
              Find events worth showing up for, discover communities that match your interests, and plan around your classes, not against them.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/discover" className={buttonClass('primary', 'lg')}>Explore events <ArrowRight className="size-4" aria-hidden /></Link>
              <Link to="/clubs" className={buttonClass('secondary', 'lg')}>Discover clubs</Link>
            </div>
            <dl className="mt-10 grid max-w-xl grid-cols-1 gap-4 border-t border-line pt-6 sm:grid-cols-3">
              {[
                [CalendarCheck2, 'Timetable-aware', 'Check clashes before you commit'],
                [BadgeCheck, 'On-Duty workflow', 'Request OD for eligible events'],
                [QrCode, 'QR passes', 'Your ticket, on your phone'],
              ].map(([Icon, t, d]) => {
                const I = Icon as typeof QrCode;
                return (
                  <div key={t as string} className="flex gap-3">
                    <I className="mt-0.5 size-5 shrink-0 text-terracotta" aria-hidden />
                    <div><dt className="text-sm font-bold">{t as string}</dt><dd className="text-xs text-plum-soft">{d as string}</dd></div>
                  </div>
                );
              })}
            </dl>
          </motion.div>

          {hero && (
            <motion.div initial={{ opacity: 0, y: 24, rotate: 1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="relative">
              <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-blush/60 via-peach to-transparent blur-2xl" aria-hidden />
              <Link to={`/events/${hero.id}`} className="group block overflow-hidden rounded-[30px] border border-line bg-white shadow-float">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img src={hero.image} alt="" className="size-full object-cover transition duration-700 group-hover:scale-[1.03]" />
                  <span className="absolute top-4 left-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold">Next up · {hero.categoryName}</span>
                </div>
                <div className="p-6">
                  <p className="text-xs font-bold text-terracotta-deep">{hero.club}</p>
                  <h2 className="mt-1 text-2xl leading-tight font-extrabold">{hero.title}</h2>
                  <p className="mt-2 text-sm text-plum-soft">{longDate(hero.startsAt)} · {timeRange(hero)}</p>
                  <div className="mt-4 flex items-center justify-between"><StatusBadge event={hero} now={now} />
                    <span className="inline-flex items-center gap-1 text-sm font-bold text-terracotta-deep">View event <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>
                  </div>
                </div>
              </Link>
            </motion.div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><Kicker>Discover by interest</Kicker><h2 className="mt-2 text-3xl font-extrabold">What are you into?</h2></div>
          <Link to="/discover" className="inline-flex items-center gap-1 text-sm font-bold text-terracotta-deep hover:underline"><Compass className="size-4" aria-hidden />Full directory</Link>
        </div>
        <div className="no-scrollbar mt-6 flex gap-2.5 overflow-x-auto pb-1">
          {INTERESTS.map(([slug, name]) => (
            <Link key={slug} to={`/discover?category=${slug}`} className="shrink-0 rounded-full border border-mauve-strong bg-white px-4 py-2 text-sm font-semibold shadow-soft transition hover:border-terracotta hover:text-terracotta-deep">
              {name}
            </Link>
          ))}
        </div>
        <div className="mt-8 grid gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
          {upcoming.slice(0, 3).map(e => <EventCard key={e.id} event={e} now={now} />)}
        </div>
        {feed.isSample && <p className="mt-4 text-xs text-plum-muted">Showing sample events until clubs publish their first events.</p>}
      </section>

      <section className="border-t border-line bg-cream/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Kicker>How CampusSync works</Kicker>
            <h2 className="mt-2 text-3xl font-extrabold">Academic-context-aware event coordination</h2>
          </div>
          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Discover & filter', 'Browse hackathons, cultural nights and pitch clinics from every club.'],
              ['Check your schedule', 'Registration compares the event with your weekly timetable.'],
              ['Request On-Duty', 'If an eligible event overlaps a class, request OD in the same flow.'],
              ['Show your pass', 'Get a QR pass that keeps check-in and registration in one place.'],
            ].map(([t, d], i) => (
              <motion.li key={t} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ delay: i * 0.06 }}
                         className="rounded-[22px] border border-line bg-white p-6 shadow-soft">
                <span className="font-display text-sm font-extrabold text-terracotta">0{i + 1}</span>
                <h3 className="mt-3 text-lg">{t}</h3>
                <p className="mt-2 text-sm text-plum-soft">{d}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
