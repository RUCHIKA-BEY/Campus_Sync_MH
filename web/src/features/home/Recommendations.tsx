// Recommended events from get_recommendations(): a transparent score with
// the reasons shown on every card ("Matches your interests", …).
import { Link } from 'react-router';
import { Sparkles } from 'lucide-react';
import { Badge, Kicker, Skeleton } from '../../components/ui';
import { useRecommendations } from '../../lib/dashboards';
import { usePublicEvents } from '../../lib/publicEvents';
import { EventCard } from '../discover/EventCard';
import { useNow } from '../events/eventUi';

export function Recommendations({ limit = 3, title = 'Recommended for you' }: { limit?: number; title?: string }) {
  const now = useNow();
  const recs = useRecommendations(limit);
  const events = usePublicEvents();
  if (recs.isPending || events.isPending) return <Skeleton className="h-72 rounded-[22px]" />;
  const byId = new Map((events.data ?? []).map(e => [e.id, e]));
  const items = (recs.data ?? []).flatMap(r => { const e = byId.get(r.event_id); return e ? [{ r, e }] : []; });

  return (
    <section aria-labelledby="recs-heading">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div><Kicker>For you</Kicker><h2 id="recs-heading" className="mt-1 text-2xl font-extrabold">{title}</h2></div>
        <Link to="/profile" className="text-sm font-semibold text-terracotta-deep hover:underline">Tune interests</Link>
      </div>
      {recs.isError ? (
        <p className="text-sm text-plum-soft">Recommendations are unavailable right now.</p>
      ) : !items.length ? (
        <Link to="/profile" className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-sm shadow-soft hover:border-terracotta">
          <Sparkles className="size-5 text-terracotta" aria-hidden />
          <span>No suggestions yet. Pick interests, follow clubs and add your timetable, and we’ll suggest open events that fit.</span>
        </Link>
      ) : (
        <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(({ r, e }) => (
            <div key={e.id} className="grid gap-2">
              <EventCard event={e} now={now} />
              <div className="flex flex-wrap gap-1.5 px-1" aria-label="Why this was suggested">
                {r.reasons.map(reason => <Badge key={reason} tone={reason === 'Fits your timetable' ? 'sage' : 'neutral'}>{reason}</Badge>)}
                {r.conflict_status === 'partial_conflict' && <Badge tone="amber">Partly clashes with a class</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
