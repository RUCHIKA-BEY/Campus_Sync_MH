import { CalendarDays, Compass, House, LayoutDashboard, ShieldCheck, Ticket, UsersRound, ClipboardCheck, type LucideIcon } from 'lucide-react';
import type { AppRole } from '../../lib/types';

export interface NavItem { to: string; label: string; short?: string; icon: LucideIcon }

export const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/clubs', label: 'Clubs', icon: UsersRound },
  { to: '/timetable', label: 'Timetable', icon: CalendarDays },
  { to: '/registrations', label: 'My Events', icon: Ticket },
];

/** Shown ONLY to the matching role (a UI convenience; RLS enforces access). */
export const ROLE_NAV: Partial<Record<AppRole, NavItem>> = {
  organizer: { to: '/organizer', label: 'Organizer Console', short: 'Console', icon: LayoutDashboard },
  dsa: { to: '/dsa', label: 'DSA Desk', short: 'DSA Desk', icon: ClipboardCheck },
  admin: { to: '/admin', label: 'Admin', short: 'Admin', icon: ShieldCheck },
};

export const MOBILE_TABS: NavItem[] = [
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/clubs', label: 'Clubs', icon: UsersRound },
  { to: '/timetable', label: 'Timetable', icon: CalendarDays },
  { to: '/registrations', label: 'My Events', icon: Ticket },
];
