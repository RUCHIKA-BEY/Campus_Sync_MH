// Personal home for signed-in students. Every number comes from
// student_dashboard() (one aggregate query, only about the caller).
import { Link } from 'react-router';
import { BadgeCheck, Bell, CalendarDays, CalendarCheck2, Compass, Sparkles, Ticket, UsersRound } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Card, FormStatus, Kicker, buttonClass } from '../../components/ui';
import { StatCard } from '../../components/StatCard';
import { friendlyError } from '../../lib/errors';
import { useStudentDashboard } from '../../lib/dashboards';
import { longDate, timeRange } from '../../lib/events';
import { timeAgo, useNotifications } from '../../lib/notifications';
import { useMyRegistrations } from '../../lib/registration';
import { Recommendations } from './Recommendations';

export function StudentHome() {
  const { profile } = useAuth();
  const dash = useStudentDashboard();
  const regs = useMyRegistrations();
  const notes = useNotifications(4);
  const d = dash.data;
  const upcoming = (regs.data ?? []).filter(r => Date.parse(r.event.endsAt) > Date.now())
    .sort((a, b) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt)).slice(0, 3);

  return (
    <div className="ambient">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-8 pb-16 sm:px-6 lg:pt-12">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Kicker>Your campus, this week</Kicker>
            <h1 className="mt-2 text-[clamp(2rem,4.6vw,3.2rem)] leading-[1.05] font-extrabold">
              Hi {profile?.full_name.split(' ')[0]}, <span className="text-terracotta">what’s next?</span>
            </h1>
          </div>
          <Link to="/discover" className={buttonClass('primary', 'lg')}><Compass className="size-4" />Explore events</Link>
        </header>

        {dash.isError ? <FormStatus kind="error">{friendlyError(dash.error)}</FormStatus> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Upcoming registrations" value={d?.upcoming_registrations} icon={Ticket} loading={!d} />
            <StatCard label="On-Duty pending" value={d?.pending_od} icon={BadgeCheck} loading={!d} hint={d ? `${d.approved_od} approved` : undefined} />
            <StatCard label="Events attended" value={d?.events_attended} icon={CalendarCheck2} loading={!d} />
            <StatCard label="Clubs you follow" value={d?.clubs_followed} icon={UsersRound} loading={!d} hint={d ? `of ${d.active_clubs} active clubs` : undefined} />
          </div>
        )}

        {/* Honest setup nudges: recommendations and clash checks need these. */}
        {d && (d.timetable_classes === 0 || d.interests === 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {d.timetable_classes === 0 && (
              <Link to="/timetable" className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-sm shadow-soft hover:border-terracotta">
                <CalendarDays className="size-5 shrink-0 text-terracotta" aria-hidden />
                <span><strong>Add this term’s timetable.</strong> Without it we can’t tell whether an event clashes with your classes.</span>
              </Link>
            )}
            {d.interests === 0 && (
              <Link to="/profile" className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-sm shadow-soft hover:border-terracotta">
                <Sparkles className="size-5 shrink-0 text-terracotta" aria-hidden />
                <span><strong>Pick your interests</strong> to get better suggestions.</span>
              </Link>
            )}
          </div>
        )}

        <Recommendations />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Your next events</h2>
              <Link to="/registrations" className="text-sm font-semibold text-terracotta-deep hover:underline">My events</Link></div>
            {!upcoming.length ? <p className="mt-3 text-sm text-plum-soft">Nothing booked yet. {d ? `${d.upcoming_public_events} events are open on campus.` : ''}</p> : (
              <ul className="mt-3 divide-y divide-line">
                {upcoming.map(r => (
                  <li key={r.id} className="py-2.5">
                    <Link to={`/events/${r.event.id}`} className="font-semibold hover:underline">{r.event.title}</Link>
                    <p className="text-xs text-plum-soft">{longDate(r.event.startsAt)} · {timeRange(r.event)} · {r.event.venue}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Latest updates</h2>
              <Link to="/notifications" className="text-sm font-semibold text-terracotta-deep hover:underline">All</Link></div>
            {!notes.data?.length ? <p className="mt-3 flex items-center gap-2 text-sm text-plum-soft"><Bell className="size-4" aria-hidden />No notifications yet.</p> : (
              <ul className="mt-3 divide-y divide-line">
                {notes.data.map(n => (
                  <li key={n.id} className="py-2.5 text-sm">
                    <p className="font-semibold">{!n.is_read && <span className="mr-1.5 inline-block size-2 rounded-full bg-terracotta align-middle" aria-label="Unread" />}{n.title}</p>
                    <p className="text-plum-soft">{n.message} <span className="text-xs text-plum-muted">· {timeAgo(n.created_at)}</span></p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
