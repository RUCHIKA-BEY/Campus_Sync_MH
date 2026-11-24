import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Bookmark, Search, SearchX, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Button, Kicker, Select, cx } from '../../components/ui';
import { isConfigured } from '../../lib/env';
import { DEFAULT_FILTERS, SAMPLE_EVENTS, filterEvents, matchInterests, type EventFilters, type When } from '../../lib/events';
import { useSavedEvents } from '../../lib/demo';
import { useCategories, useMyInterestIds } from '../../lib/queries';
import { SampleNotice, useNow } from '../events/eventUi';
import { EventCard } from './EventCard';
import { FeaturedSpotlight } from './FeaturedSpotlight';

const WHEN_OPTIONS: Array<{ value: When; label: string }> = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'past', label: 'Past' },
];

/** Filters live in the URL (?q=&category=&when=…) so a view can be shared or bookmarked. */
function useFilters(): [EventFilters, (patch: Partial<EventFilters>) => void, () => void] {
  const [params, setParams] = useSearchParams();
  const filters: EventFilters = {
    query: params.get('q') ?? '',
    category: params.get('category') ?? 'all',
    club: params.get('club') ?? 'all',
    when: (WHEN_OPTIONS.some(o => o.value === params.get('when')) ? params.get('when') : 'upcoming') as When,
    savedOnly: params.get('saved') === '1',
  };
  const update = (patch: Partial<EventFilters>) => {
    const next = { ...filters, ...patch };
    const p = new URLSearchParams();
    if (next.query) p.set('q', next.query);
    if (next.category !== 'all') p.set('category', next.category);
    if (next.club !== 'all') p.set('club', next.club);
    if (next.when !== 'upcoming') p.set('when', next.when);
    if (next.savedOnly) p.set('saved', '1');
    setParams(p, { replace: true });
  };
  return [filters, update, () => setParams(new URLSearchParams(), { replace: true })];
}

export function DiscoverPage() {
  const now = useNow();
  const [filters, update, reset] = useFilters();
  const { savedIds } = useSavedEvents();
  const events = SAMPLE_EVENTS;
  const results = useMemo(() => filterEvents(events, filters, now, savedIds), [events, filters, now, savedIds]);
  const featured = useMemo(
    () => events.filter(e => e.featured && Date.parse(e.endsAt) > now.getTime()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [events, now]);
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    events.forEach(e => seen.set(e.categorySlug, e.categoryName));
    return [...seen].map(([slug, name]) => ({ slug, name }));
  }, [events]);
  const clubs = useMemo(() => [...new Set(events.map(e => e.club))].sort(), [events]);
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="ambient">
      <div className="mx-auto max-w-7xl px-4 pt-8 pb-16 sm:px-6 lg:pt-12">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Kicker className="mb-2">Campus directory</Kicker>
            <h1 className="text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.02] font-extrabold">
              What’s on, <span className="text-terracotta">worth showing up for.</span>
            </h1>
          </div>
          <SampleNotice className="max-w-md" />
        </div>

        {!isFiltered && <FeaturedSpotlight events={featured} now={now} />}
        {!isFiltered && <ForYou />}

        {/* ---------------- Sticky discovery tools ---------------- */}
        <section aria-label="Find events" className="sticky top-16 z-30 -mx-4 mt-10 border-y border-line/80 bg-ivory/90 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="relative min-w-0 flex-1 basis-64">
              <span className="sr-only">Search events</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-plum-muted" aria-hidden />
              <input type="search" value={filters.query} onChange={e => update({ query: e.target.value })}
                     placeholder="Search events, clubs or venues"
                     className="h-11 w-full rounded-xl border border-line bg-white pr-3 pl-10 text-base text-plum placeholder:text-plum-muted focus:border-plum focus:ring-3 focus:ring-plum/10 focus:outline-none" />
            </label>
            <div role="group" aria-label="When" className="flex rounded-xl border border-line bg-white p-1">
              {WHEN_OPTIONS.map(o => (
                <button key={o.value} type="button" aria-pressed={filters.when === o.value} onClick={() => update({ when: o.value })}
                        className={cx('relative rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors',
                          filters.when === o.value ? 'text-white' : 'text-plum-soft hover:text-plum')}>
                  {filters.when === o.value && <motion.span layoutId="when-pill" className="absolute inset-0 rounded-lg bg-plum" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <span className="relative">{o.label}</span>
                </button>
              ))}
            </div>
            <Select aria-label="Filter by club" value={filters.club} onChange={e => update({ club: e.target.value })} className="h-11 min-h-0 w-auto max-w-56 bg-white text-sm">
              <option value="all">All clubs</option>
              {clubs.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <button type="button" aria-pressed={filters.savedOnly} onClick={() => update({ savedOnly: !filters.savedOnly })}
                    className={cx('inline-flex h-11 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold transition',
                      filters.savedOnly ? 'border-terracotta bg-peach text-terracotta-deep' : 'border-line bg-white text-plum-soft hover:text-plum')}>
              <Bookmark className="size-4" fill={filters.savedOnly ? 'currentColor' : 'none'} aria-hidden /> Saved
              <span className="rounded-md bg-cream px-1.5 text-xs">{savedIds.size}</span>
            </button>
          </div>
          <div className="no-scrollbar -mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Category">
            {[{ slug: 'all', name: 'All' }, ...categories].map(c => {
              const on = filters.category === c.slug;
              return (
                <button key={c.slug} type="button" aria-pressed={on} onClick={() => update({ category: c.slug })}
                        className={cx('shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition',
                          on ? 'border-plum bg-plum text-ivory' : 'border-mauve-strong bg-mauve/70 text-plum hover:border-plum')}>
                  {c.name}
                </button>
              );
            })}
          </div>
        </section>

        {/* ---------------- Results ---------------- */}
        <div className="mt-6 mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-plum-soft" aria-live="polite">
            {results.length === 1 ? '1 event' : `${results.length} events`}
            {isFiltered ? (results.length === 1 ? ' matches your filters' : ' match your filters') : ' coming up'}
          </p>
          {isFiltered && <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-sm font-semibold text-terracotta-deep hover:underline"><X className="size-4" />Clear filters</button>}
        </div>

        {results.length ? (
          <motion.div layout className="grid gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {results.map(e => <EventCard key={e.id} event={e} now={now} />)}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-mauve-strong bg-white/60 px-6 py-16 text-center">
            <SearchX className="size-8 text-terracotta" aria-hidden />
            <h2 className="text-xl">{filters.savedOnly && savedIds.size === 0 ? 'Nothing saved yet' : 'No events match'}</h2>
            <p className="max-w-sm text-sm text-plum-soft">
              {filters.savedOnly && savedIds.size === 0 ? 'Tap the bookmark on any event to keep it here.' : 'Try another category, a wider date range, or a different search.'}
            </p>
            <Button variant="secondary" onClick={reset}>Clear filters</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** "For you": a transparent rule (your saved interests ∩ event category). */
function ForYou() {
  const now = useNow();
  const { session, profile } = useAuth();
  const categories = useCategories();
  const interests = useMyInterestIds();
  if (!isConfigured || !session || profile?.role !== 'student') return null;

  if (interests.data && interests.data.size === 0) {
    return (
      <Link to="/profile" className="mt-6 flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-sm shadow-soft transition hover:border-terracotta">
        <Sparkles className="size-5 text-terracotta" aria-hidden />
        <span><strong>Personalise Discover:</strong> pick your interests and we’ll show matching events first.</span>
      </Link>
    );
  }
  if (!interests.data || !categories.data) return null;
  const slugs = new Set(categories.data.filter(c => interests.data.has(c.id)).map(c => c.slug));
  const picks = matchInterests(SAMPLE_EVENTS, slugs, now).slice(0, 3);
  if (!picks.length) return null;
  const names = categories.data.filter(c => slugs.has(c.slug)).map(c => c.name).join(', ');
  return (
    <section aria-labelledby="for-you" className="mt-10">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <Kicker>For you</Kicker>
          <h2 id="for-you" className="mt-1 text-2xl font-extrabold">Because you picked {names}</h2>
        </div>
        <Link to="/profile" className="text-sm font-semibold text-terracotta-deep hover:underline">Edit interests</Link>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {picks.map(e => <EventCard key={e.id} event={e} now={now} />)}
      </div>
    </section>
  );
}
