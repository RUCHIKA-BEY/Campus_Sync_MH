import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Check, Plus, Search, UsersRound, CloudOff } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useToast } from '../../components/Toaster';
import { EmptyState, FormStatus, PageHeader, Skeleton, buttonClass, cx } from '../../components/ui';
import { isConfigured } from '../../lib/env';
import { friendlyError } from '../../lib/errors';
import { SAMPLE_EVENTS } from '../../lib/events';
import { useClubs, useMyFollowedClubIds, useToggleFollow } from '../../lib/queries';
import type { Club } from '../../lib/types';

// Used only when no backend is connected (sample mode).
const SAMPLE_CLUBS: Club[] = [
  { id: 's1', name: 'IEEE Student Branch', short_name: 'IE', description: 'A student-led home for builders, researchers, and anyone curious about what comes next.', category: { name: 'Technology', slug: 'technology' } },
  { id: 's2', name: 'Campus Cultural Guild', short_name: 'CG', description: 'Music, theatre, visual arts, and the little moments that make campus memorable.', category: { name: 'Arts & Culture', slug: 'arts-culture' } },
  { id: 's3', name: 'Build Club', short_name: 'BC', description: 'Learn by making: autonomous systems, projects, prototypes, research and weekend build sessions.', category: { name: 'Technology', slug: 'technology' } },
  { id: 's4', name: 'E-Cell Entrepreneurship Hub', short_name: 'EC', description: 'A practical community for founders, operators, mentors, and ambitious first experiments.', category: { name: 'Entrepreneurship', slug: 'entrepreneurship' } },
  { id: 's5', name: 'Women in Tech Campus', short_name: 'WT', description: 'A welcoming peer network for women and allies building confidence in tech.', category: { name: 'Community', slug: 'community' } },
  { id: 's6', name: 'Speaker and Anchors club', short_name: 'SC', description: 'A student-led community for public speaking and event hosting.', category: { name: 'Arts & Culture', slug: 'arts-culture' } },
];

const TINTS = ['from-terracotta to-terracotta-deep', 'from-plum-soft to-plum', 'from-cat-purple to-plum', 'from-amber to-terracotta-deep', 'from-cat-blue to-plum-soft', 'from-sage to-plum-soft'];

export function ClubsPage() {
  const clubsQuery = useClubs();
  const [query, setQuery] = useState('');
  const clubs = isConfigured ? clubsQuery.data : SAMPLE_CLUBS;
  const filtered = useMemo(() => (clubs ?? []).filter(c =>
    `${c.name} ${c.category?.name ?? ''} ${c.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())), [clubs, query]);

  return (
    <div className="ambient">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <PageHeader kicker="Find your people" title={<>Clubs that make campus <span className="text-terracotta">feel like yours.</span></>}
          actions={
            <label className="relative w-full sm:w-72">
              <span className="sr-only">Search clubs</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-plum-muted" aria-hidden />
              <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search clubs"
                     className="h-11 w-full rounded-xl border border-line bg-white pr-3 pl-10 text-base focus:border-plum focus:ring-3 focus:ring-plum/10 focus:outline-none" />
            </label>
          } />

        {isConfigured && clubsQuery.isError ? (
          <EmptyState icon={<CloudOff className="size-6" />} title="Couldn’t load clubs">{friendlyError(clubsQuery.error)}</EmptyState>
        ) : isConfigured && clubsQuery.isPending ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-56 rounded-[22px]" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<UsersRound className="size-6" />} title="No clubs match">Try a different search.</EmptyState>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((club, i) => <ClubCard key={club.id} club={club} tint={TINTS[i % TINTS.length]!} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ClubCard({ club, tint, index }: { club: Club; tint: string; index: number }) {
  const upcoming = SAMPLE_EVENTS.filter(e => e.club === club.name && Date.parse(e.endsAt) > Date.now()).length;
  return (
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04 }}
      className="group flex flex-col rounded-[22px] border border-line bg-white p-5 shadow-soft transition hover:-translate-y-1 hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <span className={cx('grid size-14 place-items-center rounded-2xl bg-gradient-to-br font-display text-lg font-extrabold text-white shadow-lift', tint)}>{club.short_name}</span>
        <FollowButton club={club} />
      </div>
      <h3 className="mt-4 text-lg leading-snug">{club.name}</h3>
      <p className="mt-1.5 line-clamp-3 text-sm text-plum-soft">{club.description}</p>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-4 text-xs font-semibold text-plum-soft">
        <span className="rounded-full bg-mauve px-2.5 py-1 text-plum">{club.category?.name ?? 'Club'}</span>
        {upcoming > 0
          ? <Link to={`/discover?club=${encodeURIComponent(club.name)}`} className="text-terracotta-deep hover:underline">{upcoming} sample {upcoming === 1 ? 'event' : 'events'} →</Link>
          : <span>No upcoming events</span>}
      </div>
    </motion.article>
  );
}

function FollowButton({ club }: { club: Club }) {
  const { session } = useAuth();
  const follows = useMyFollowedClubIds();
  const toggle = useToggleFollow();
  const toast = useToast();
  if (!isConfigured) return null;
  if (!session) return <Link to="/login" className={buttonClass('secondary', 'sm')}><Plus className="size-4" />Follow</Link>;
  if (follows.isError) return <span title={friendlyError(follows.error)}><FormStatus kind="error">Unavailable</FormStatus></span>;
  const following = follows.data?.has(club.id) ?? false;
  return (
    <button type="button" aria-pressed={following} disabled={!follows.data || toggle.isPending}
            onClick={() => toggle.mutate({ clubId: club.id, follow: !following }, {
              onSuccess: () => toast(following ? `Unfollowed ${club.name}.` : `Following ${club.name}.`, 'success'),
              onError: e => toast(friendlyError(e), 'error'),
            })}
            className={buttonClass(following ? 'plum' : 'secondary', 'sm')}>
      {following ? <><Check className="size-4" />Following</> : <><Plus className="size-4" />Follow</>}
    </button>
  );
}
