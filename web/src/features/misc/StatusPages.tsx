import { Link } from 'react-router';
import { Hammer, MapPinOff } from 'lucide-react';
import { EmptyState, buttonClass } from '../../components/ui';

const AREAS = {
  timetable: { title: 'My timetable', text: 'Your weekly class schedule, with clash checks against events. This screen is being rebuilt next, together with saving your timetable to your account.' },
  organizer: { title: 'Organizer console', text: 'Create event proposals, track approval, and manage registrations and attendance. Built in Stage 5.' },
  dsa: { title: 'DSA desk', text: 'Review event proposals, venue and schedule warnings, and On-Duty requests. Built in Stages 5–7.' },
  admin: { title: 'Admin', text: 'Users and roles, clubs, venues, and the audit log. Built in the dashboard stage.' },
} as const;

export function ComingNextPage({ area }: { area: keyof typeof AREAS }) {
  const a = AREAS[area];
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <EmptyState icon={<Hammer className="size-6" />} title={`${a.title} is being rebuilt`}
                  action={<Link to="/discover" className={buttonClass('secondary')}>Explore events meanwhile</Link>}>
        {a.text}
      </EmptyState>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <EmptyState icon={<MapPinOff className="size-6" />} title="Page not found"
                  action={<Link to="/" className={buttonClass('primary')}>Go home</Link>}>
        The page you’re looking for doesn’t exist or has moved.
      </EmptyState>
    </div>
  );
}
