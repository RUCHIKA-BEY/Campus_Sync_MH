// Organizer numbers from organizer_dashboard(): registrations, open seats,
// attendance rate, and how full each upcoming event is.
import { Armchair, Percent, Ticket } from 'lucide-react';
import { Card, FormStatus } from '../../components/ui';
import { StatCard } from '../../components/StatCard';
import { friendlyError } from '../../lib/errors';
import { useOrganizerDashboard } from '../../lib/dashboards';
import { longDate } from '../../lib/events';

export function OrganizerInsights() {
  const q = useOrganizerDashboard();
  if (q.isError) return <FormStatus kind="error">{friendlyError(q.error)}</FormStatus>;
  const d = q.data;
  return (
    <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
        <StatCard label="Active registrations" value={d?.total_registrations} icon={Ticket} loading={!d} />
        <StatCard label="Seats still open" value={d?.seats_available} icon={Armchair} loading={!d} hint="Across upcoming published events" />
        <StatCard label="Attendance rate" value={d ? (d.attendance_rate === null ? '—' : `${d.attendance_rate}%`) : undefined} icon={Percent} loading={!d}
                  hint={d?.attendance_rate === null ? 'Shown once an event has happened' : 'Checked in ÷ registered, past events'} />
      </div>
      <Card className="p-5">
        <h2 className="text-lg font-bold">Upcoming events</h2>
        {!d ? <p className="mt-3 text-sm text-plum-soft">Loading…</p>
          : !d.upcoming.length ? <p className="mt-3 text-sm text-plum-soft">No approved or published events coming up.</p>
          : (
            <ul className="mt-3 grid gap-4">
              {d.upcoming.map(e => {
                const pct = Math.min(100, Math.round((e.registered / e.capacity) * 100));
                return (
                  <li key={e.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-semibold">{e.title}</span>
                      <span className="shrink-0 tabular-nums text-plum-soft">{e.registered}/{e.capacity}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-mauve" role="progressbar" aria-label={`${e.title} seats filled`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-terracotta" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-plum-muted">{longDate(e.starts_at)} · {e.status === 'approved' ? 'approved, not yet published' : `${e.checked_in} checked in`}</p>
                  </li>
                );
              })}
            </ul>
          )}
      </Card>
    </div>
  );
}
