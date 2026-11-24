// "Can I attend?" — shows the DATABASE's timetable-conflict answer for the
// signed-in student (check_timetable_conflict). No conflict maths in the
// browser: one authoritative implementation, used again at registration.
import { Link } from 'react-router';
import { CalendarCheck2, CalendarClock, CalendarX2, CircleHelp, LoaderCircle } from 'lucide-react';
import { cx } from '../../components/ui';
import { friendlyError } from '../../lib/errors';
import { CONFLICT_LABEL, useConflictCheck, type ConflictResult } from '../../lib/registration';
import { clockLabel } from '../../lib/time';

const TONE = {
  no_conflict: { box: 'border-sage/30 bg-sage-bg text-sage', Icon: CalendarCheck2 },
  partial_conflict: { box: 'border-amber/30 bg-amber-bg text-amber', Icon: CalendarClock },
  full_conflict: { box: 'border-terracotta/30 bg-peach text-terracotta-deep', Icon: CalendarX2 },
  timetable_not_configured: { box: 'border-line bg-cream text-plum-soft', Icon: CircleHelp },
} as const;

const istTime = (iso: string) => clockLabel(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
const minutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

export function ConflictSummary({ result, compact }: { result: ConflictResult; compact?: boolean }) {
  const { box, Icon } = TONE[result.status];
  return (
    <div className={cx('rounded-2xl border p-4 text-sm', box)} role="status">
      <p className="flex items-center gap-2 font-bold"><Icon className="size-4" aria-hidden />{CONFLICT_LABEL[result.status]}</p>
      {result.status === 'timetable_not_configured' && (
        <p className="mt-1 text-plum-soft">We can’t confirm you’re free. <Link to="/timetable" className="font-semibold text-terracotta-deep underline">Add your classes</Link> to check.</p>
      )}
      {result.conflicts.length > 0 && !compact && (
        <ul className="mt-2 grid gap-1 text-plum">
          {result.conflicts.map((c, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">{c.subject}{c.course_code ? ` (${c.course_code})` : ''}</span>
              <span className="shrink-0 tabular-nums text-plum-soft">{istTime(c.overlap_start)}–{istTime(c.overlap_end)}</span>
            </li>
          ))}
        </ul>
      )}
      {result.status !== 'timetable_not_configured' && result.overlap_minutes > 0 && (
        <p className="mt-2 text-xs text-plum-soft">
          Overlap {minutes(result.overlap_minutes)} of {minutes(result.event_minutes)} · free for {minutes(result.free_minutes)}
          {result.od_eligible ? ' · you can request On-Duty for this event' : ' · this event is not OD-eligible'}
        </p>
      )}
    </div>
  );
}

export function CanIAttend({ eventId }: { eventId: string }) {
  const q = useConflictCheck(eventId, true);
  if (q.isPending) return <p className="flex items-center gap-2 text-sm text-plum-soft"><LoaderCircle className="size-4 animate-spin" aria-hidden />Checking your timetable…</p>;
  if (q.isError) return <p className="text-sm text-terracotta-deep">{friendlyError(q.error)}</p>;
  return <ConflictSummary result={q.data} />;
}
