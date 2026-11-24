// Small pieces shared by event cards, the spotlight and the detail page.
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Bookmark, BadgeCheck, FlaskConical, CircleDot, Clock3, Lock, Users } from 'lucide-react';
import { Badge, cx } from '../../components/ui';
import { registrationStatus, statusLabel, type CampusEvent, type RegistrationStatus } from '../../lib/events';
import { useSavedEvents } from '../../lib/demo';

/** Current time, refreshed every minute so statuses flip on their own. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const STATUS_TONE: Record<RegistrationStatus, Parameters<typeof Badge>[0]['tone']> = {
  open: 'sage', 'closing-soon': 'amber', full: 'muted', 'not-open': 'neutral', closed: 'muted', 'in-progress': 'terracotta', ended: 'muted', cancelled: 'muted',
};
const STATUS_ICON: Record<RegistrationStatus, typeof Users> = {
  open: Users, 'closing-soon': Clock3, full: Lock, 'not-open': Clock3, closed: Lock, 'in-progress': CircleDot, ended: Lock, cancelled: Lock,
};

export function StatusBadge({ event, now, className }: { event: CampusEvent; now: Date; className?: string }) {
  const s = registrationStatus(event, now);
  const Icon = STATUS_ICON[s];
  return <Badge tone={STATUS_TONE[s]} icon={<Icon className="size-3" aria-hidden />} className={className}>{statusLabel(s, event)}</Badge>;
}

export function OdBadge({ className }: { className?: string }) {
  return (
    <Badge tone="terracotta" className={className} icon={<BadgeCheck className="size-3" aria-hidden />}>
      <span title="On-Duty can be requested for this event">OD eligible</span>
    </Badge>
  );
}

export function BookmarkButton({ eventId, title, className }: { eventId: string; title: string; className?: string }) {
  const { savedIds, toggle } = useSavedEvents();
  const saved = savedIds.has(eventId);
  return (
    <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={e => { e.preventDefault(); e.stopPropagation(); toggle(eventId); }}
      aria-pressed={saved} aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`} title={saved ? 'Saved on this device' : 'Save'}
      className={cx('grid size-10 place-items-center rounded-full bg-white/95 shadow-soft backdrop-blur transition hover:scale-105',
        saved ? 'text-terracotta' : 'text-plum-soft hover:text-plum', className)}>
      <Bookmark className="size-[18px]" fill={saved ? 'currentColor' : 'none'} aria-hidden />
    </motion.button>
  );
}

export function SampleNotice({ className }: { className?: string }) {
  return (
    <p className={cx('flex items-start gap-2.5 rounded-2xl border border-line bg-amber-bg/80 px-4 py-3 text-sm text-plum', className)}>
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
      <span>
        <strong className="font-semibold">Sample events.</strong> Real club events appear here once proposal approval and
        registration are connected. Saving and demo registration are kept <em>on this device</em> only.
      </span>
    </p>
  );
}

export function DateBlock({ iso, className }: { iso: string; className?: string }) {
  const d = new Date(iso);
  const month = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short' }).format(d).toUpperCase();
  const day = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(d);
  return (
    <div className={cx('grid w-14 place-items-center rounded-2xl bg-white py-1.5 text-center shadow-lift ring-1 ring-line', className)}>
      <span className="text-[10px] font-extrabold tracking-[0.12em] text-terracotta-deep">{month}</span>
      <span className="font-display text-2xl leading-none font-extrabold text-plum">{day}</span>
    </div>
  );
}
