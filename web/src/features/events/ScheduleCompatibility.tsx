// Timetable clash display, in three places: the event page section,
// the confirmation before registering, and a line on the pass.
// Everything here only DISPLAYS a ScheduleState (lib/schedule.ts); no
// clash maths happens in these components.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BadgeCheck, CalendarCheck2, CalendarClock, CircleHelp, CloudOff, FlaskConical, LoaderCircle, LogIn, RotateCw } from 'lucide-react';
import { Badge, Button, cx } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { clockLabel } from '../../lib/time';
import { longDate, timeRange, type CampusEvent } from '../../lib/events';
import type { ScheduleSource, ScheduleState } from '../../lib/schedule';
import type { ConflictItem, ConflictResult } from '../../lib/registration';

// ------------------------------------------------------------ formatting
const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
export const istTime = (iso: string) => clockLabel(hm.format(new Date(iso)));
export const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const classWord = (n: number) => `${n} scheduled class${n === 1 ? '' : 'es'}`;
const isClash = (r: ConflictResult) => r.status === 'partial_conflict' || r.status === 'full_conflict';

/** Would the campus rule (D8) refuse this registration? */
export function blockedByPolicy(r: ConflictResult, odEligible: boolean, allowFull: boolean | undefined) {
  return r.status === 'full_conflict' && !odEligible && allowFull === false;
}

function SourceNote({ source }: { source: ScheduleSource }) {
  if (source === 'database') return <p className="mt-3 text-xs text-plum-muted">Checked against your saved timetable, the same check used when you register.</p>;
  return (
    <p className="mt-3 flex items-start gap-1.5 text-xs text-plum-soft">
      <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-amber" aria-hidden />
      {source === 'preview'
        ? 'Demo preview: this is a sample event, checked against your saved timetable. Sample events can’t be registered for real, so this is not an official record.'
        : 'Demo preview: sample timetable (class 3CSE02), not anyone’s academic record. Connect the backend and sign in to check your own timetable.'}
    </p>
  );
}

function OdAdvice({ result, odEligible }: { result: ConflictResult; odEligible: boolean }) {
  if (!isClash(result)) return null;
  return odEligible
    ? <p className="flex items-start gap-1.5"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-terracotta" aria-hidden /><span><strong>On-Duty may be required.</strong> This event is OD-eligible: after registering you can request On-Duty for these classes. The DSA reviews it; until it’s approved the classes are not excused.</span></p>
    : <p className="flex items-start gap-1.5"><CircleHelp className="mt-0.5 size-4 shrink-0 text-plum-muted" aria-hidden /><span><strong>No On-Duty for this event.</strong> It isn’t OD-eligible, so attending means missing these classes without an OD excuse.</span></p>;
}

function ClassList({ items, multiDay }: { items: ConflictItem[]; multiDay: boolean }) {
  return (
    <ul className="mt-3 grid gap-2">
      {items.map((c, i) => (
        <li key={i} className="grid gap-x-4 gap-y-0.5 rounded-xl border border-amber/15 bg-white/80 px-3 py-2 sm:grid-cols-[1fr_auto]">
          <span className="font-semibold text-plum">{c.subject}{c.course_code && c.course_code !== c.subject ? <span className="font-normal text-plum-soft"> · {c.course_code}</span> : null}{c.room ? <span className="font-normal text-plum-soft"> · {c.room}</span> : null}</span>
          <span className="tabular-nums font-semibold text-amber sm:row-span-2 sm:self-center">{duration(c.overlap_minutes)} overlap</span>
          <span className="text-xs text-plum-soft tabular-nums">Class {multiDay ? `${dayFmt.format(new Date(c.class_start))}, ` : ''}{istTime(c.class_start)} – {istTime(c.class_end)} · overlaps {istTime(c.overlap_start)} – {istTime(c.overlap_end)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The detailed result: shared by the event page and the confirmation dialog. */
function ResultBody({ result, event }: { result: ConflictResult; event: CampusEvent }) {
  const n = result.conflicts.length;
  const multiDay = new Set(result.conflicts.map(c => c.date)).size > 1 || longDate(event.startsAt) !== longDate(event.endsAt);
  if (!isClash(result)) return null;
  return (
    <>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-plum-muted">Event</dt><dd className="font-semibold tabular-nums">{timeRange(event)}</dd></div>
        <div><dt className="text-xs text-plum-muted">Overlap</dt><dd className="font-semibold tabular-nums">{duration(result.overlap_minutes)} of {duration(result.event_minutes)}</dd></div>
        <div><dt className="text-xs text-plum-muted">Conflicting classes</dt><dd className="font-semibold">{n}</dd></div>
      </dl>
      <ClassList items={result.conflicts} multiDay={multiDay} />
      {result.free_minutes > 0 && <p className="mt-2 text-xs text-plum-soft">You’re free for {duration(result.free_minutes)} of the event.</p>}
    </>
  );
}

// ------------------------------------------------------- event page section
export function ScheduleCompatibility({ state, event, onRetry }: { state: ScheduleState; event: CampusEvent; onRetry: () => void }) {
  if (state.kind === 'not-applicable') return null;
  return (
    <section id="schedule" className="mt-8 scroll-mt-24" aria-labelledby="schedule-title">
      <h2 id="schedule-title" className="text-xl font-bold">Schedule Compatibility</h2>
      <div className="mt-3" role="status" aria-live="polite">{body()}</div>
    </section>
  );

  function body(): ReactNode {
    switch (state.kind) {
      case 'checking':
        return <Panel tone="neutral" icon={<LoaderCircle className="size-5 animate-spin" />} title="Checking your schedule…">Comparing this event with your timetable.</Panel>;
      case 'signed-out':
        return <Panel tone="neutral" icon={<LogIn className="size-5" />} title="Sign in to check your timetable">
          <Link to="/login" className="font-semibold text-terracotta-deep underline">Sign in</Link> as a student to see whether this event overlaps your classes.
        </Panel>;
      case 'not-student':
        return <Panel tone="neutral" icon={<CircleHelp className="size-5" />} title="Timetable checks are for students">Only student accounts have a class timetable to compare.</Panel>;
      case 'unavailable':
        return <Panel tone="neutral" icon={<CloudOff className="size-5" />} title="Conflict check unavailable"
          action={<Button variant="secondary" size="sm" onClick={onRetry}><RotateCw className="size-3.5" />Try again</Button>}>
          Unable to verify timetable compatibility. {state.message} This does <strong>not</strong> mean you’re free.
        </Panel>;
      case 'result': {
        const r = state.result;
        if (r.status === 'no_conflict') return <Panel tone="sage" icon={<CalendarCheck2 className="size-5" />} title="No conflict">Your academic timetable has no conflicts with this event.<SourceNote source={state.source} /></Panel>;
        if (r.status === 'timetable_not_configured') return <Panel tone="neutral" icon={<CircleHelp className="size-5" />} title="Timetable not configured">
          Your timetable has no classes entered for this date’s term, so we can’t confirm you’re free.{' '}
          {state.source !== 'sample' && <Link to="/timetable" className="font-semibold text-terracotta-deep underline">Add your classes</Link>}
          <SourceNote source={state.source} />
        </Panel>;
        return (
          <Panel tone="amber" icon={<CalendarClock className="size-5" />} title="Schedule Conflict Detected"
                 badge={state.source !== 'database' ? <Badge tone="amber">Demo preview</Badge> : undefined}>
            This event overlaps with {r.conflicts.length === 1 ? 'one of your scheduled academic classes' : `${classWord(r.conflicts.length)}`}{r.status === 'full_conflict' ? ' for its whole length' : ''}.
            <ResultBody result={r} event={event} />
            <div className="mt-3 text-sm text-plum"><OdAdvice result={r} odEligible={event.odEligible} /></div>
            <SourceNote source={state.source} />
          </Panel>
        );
      }
    }
  }
}

function Panel({ tone, icon, title, badge, action, children }: {
  tone: 'sage' | 'amber' | 'neutral'; icon: ReactNode; title: string; badge?: ReactNode; action?: ReactNode; children: ReactNode;
}) {
  const box = { sage: 'border-sage/25 bg-sage-bg', amber: 'border-amber/25 bg-amber-bg', neutral: 'border-line bg-cream' }[tone];
  const ink = { sage: 'text-sage', amber: 'text-amber', neutral: 'text-plum-soft' }[tone];
  return (
    <div className={cx('rounded-2xl border p-4 sm:p-5', box)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cx('flex items-center gap-2 font-display text-base font-extrabold', ink)}>{icon}{title}</p>
        {badge}
      </div>
      <div className="mt-1.5 text-sm text-plum-soft">{children}</div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// --------------------------------------------------- sidebar (short form)
export function ScheduleChip({ state }: { state: ScheduleState }) {
  if (state.kind === 'not-applicable' || state.kind === 'not-student') return null;
  const [tone, text] =
    state.kind === 'checking' ? ['muted', 'Checking your schedule…'] as const
    : state.kind === 'signed-out' ? ['muted', 'Sign in to check your timetable'] as const
    : state.kind === 'unavailable' ? ['muted', 'Conflict check unavailable'] as const
    : state.result.status === 'no_conflict' ? ['sage', 'No conflict with your classes'] as const
    : state.result.status === 'timetable_not_configured' ? ['muted', 'Timetable not configured'] as const
    : ['amber', `Conflict: ${classWord(state.result.conflicts.length)} · ${duration(state.result.overlap_minutes)}`] as const;
  return (
    <a href="#schedule" className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:bg-cream">
      <span className="flex items-center gap-2 font-semibold">
        {state.kind === 'checking' && <LoaderCircle className="size-4 animate-spin text-plum-muted" aria-hidden />}
        <Badge tone={tone}>{tone === 'amber' ? 'Clash' : tone === 'sage' ? 'Free' : 'Schedule'}</Badge>
        <span className="text-plum">{text}</span>
      </span>
      <span className="text-xs text-terracotta-deep">Details</span>
    </a>
  );
}

// ---------------------------------------------------- line on the QR pass
export function ScheduleStatusLine({ state, detailsHref, onDetails }: { state: ScheduleState; detailsHref: string; onDetails?: () => void }) {
  if (state.kind === 'not-applicable' || state.kind === 'not-student') return null;
  let tone: 'sage' | 'amber' | 'muted' = 'muted', label = 'Checking…', text: ReactNode = 'Checking your timetable…';
  if (state.kind === 'signed-out') { label = 'Not checked'; text = 'Sign in to check against your timetable.'; }
  if (state.kind === 'unavailable') { label = 'Check unavailable'; text = 'Unable to verify timetable compatibility.'; }
  if (state.kind === 'result') {
    const r = state.result;
    if (r.status === 'no_conflict') { tone = 'sage'; label = 'No conflict'; text = 'Does not overlap with your classes.'; }
    else if (r.status === 'timetable_not_configured') { label = 'Not configured'; text = 'No timetable for this date, so it can’t be confirmed.'; }
    else {
      tone = 'amber'; label = 'Conflict detected';
      const first = r.conflicts[0]!;
      text = <>Overlaps with {classWord(r.conflicts.length)}: {istTime(first.class_start)}–{istTime(first.class_end)}{r.conflicts.length > 1 ? ` and ${r.conflicts.length - 1} more` : ''} ({duration(r.overlap_minutes)} total).</>;
    }
  }
  const demo = state.kind === 'result' && state.source !== 'database';
  return (
    <div className="mx-6 mt-3 rounded-2xl border border-line px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold">
          {state.kind === 'checking' ? <LoaderCircle className="size-4 animate-spin text-plum-muted" aria-hidden /> : <CalendarClock className="size-4 text-plum-muted" aria-hidden />}
          Schedule status
        </span>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <p className="mt-1 text-xs text-plum-soft">
        {text}{demo && ' Demo preview.'}{' '}
        {(state.kind === 'result' && state.result.status !== 'no_conflict') || state.kind === 'unavailable'
          ? <Link to={detailsHref} onClick={onDetails} className="font-semibold text-terracotta-deep underline">View details</Link> : null}
      </p>
    </div>
  );
}

// ------------------------------------------- confirmation before registering
export function RegisterCheckDialog({ state, event, allowFull, onCancel, onConfirm, onRetry, retrying }: {
  state: ScheduleState | null; event: CampusEvent; allowFull: boolean | undefined;
  onCancel: () => void; onConfirm: () => void; onRetry: () => void; retrying: boolean;
}) {
  const [ack, setAck] = useState(false);
  if (!state) return null;
  const r = state.kind === 'result' ? state.result : null;
  const clash = r && isClash(r);
  const blocked = r ? blockedByPolicy(r, event.odEligible, allowFull) : false;
  const title = clash ? 'Schedule Conflict Detected' : state.kind === 'unavailable' ? 'Conflict check unavailable' : 'Timetable not configured';

  return (
    <Modal open onOpenChange={o => { if (!o) { setAck(false); onCancel(); } }} title={title}
      description={`${event.title} · ${longDate(event.startsAt)}, ${timeRange(event)}`}>
      <div className="grid gap-3 text-sm text-plum-soft">
        {clash && r && (
          <div className="rounded-2xl border border-amber/25 bg-amber-bg p-4">
            <p className="font-semibold text-plum">This event overlaps with {classWord(r.conflicts.length)}{r.status === 'full_conflict' ? ' for its whole length' : ''}.</p>
            <ResultBody result={r} event={event} />
          </div>
        )}
        {clash && r && <OdAdvice result={r} odEligible={event.odEligible} />}
        {state.kind === 'unavailable' && (
          <p>We couldn’t check your timetable just now ({state.message}). That does not mean you’re free. If you register anyway, the server checks your timetable again and records the result with your registration.</p>
        )}
        {r?.status === 'timetable_not_configured' && (
          <p>Your timetable has no classes entered for this date’s term, so we can’t confirm you’re free. {state.kind === 'result' && state.source !== 'sample' && <Link to="/timetable" className="font-semibold text-terracotta-deep underline">Add your classes</Link>}</p>
        )}
        {state.kind === 'result' && state.source !== 'database' && <SourceNote source={state.source} />}

        {blocked ? (
          <p className="rounded-xl border border-line bg-cream p-3 text-plum"><strong>Registration isn’t available.</strong> Campus rule: you can’t register for an event that clashes with your classes for its whole length unless it is OD-eligible.</p>
        ) : clash ? (
          <>
            <p className="text-xs">
              {allowFull === undefined
                ? 'Campus rule: registration with a clash is decided by the server when you register; the clash is recorded with your registration.'
                : 'Campus rule: you may register with a clash. The clash is recorded with your registration.'}
            </p>
            <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-plum">
              <input type="checkbox" className="mt-0.5 size-4 accent-terracotta" checked={ack} onChange={e => setAck(e.target.checked)} />
              <span>I understand this event overlaps my classes{event.odEligible ? ' and that On-Duty must be requested and approved separately' : ''}.</span>
            </label>
          </>
        ) : null}

        <div className="mt-1 flex flex-wrap justify-end gap-2">
          {state.kind === 'unavailable' && <Button variant="ghost" onClick={onRetry} loading={retrying}><RotateCw className="size-4" />Try again</Button>}
          <Button variant="secondary" onClick={() => { setAck(false); onCancel(); }}>{blocked ? 'Close' : 'Cancel'}</Button>
          {!blocked && (
            <Button onClick={() => { setAck(false); onConfirm(); }} disabled={Boolean(clash) && !ack}>
              {clash || state.kind === 'unavailable' || r?.status === 'timetable_not_configured' ? 'Register anyway' : 'Register'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
