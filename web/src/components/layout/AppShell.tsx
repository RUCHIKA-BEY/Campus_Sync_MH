import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell, ChevronDown, LogIn, LogOut, UserRound, BellOff, FlaskConical, CircleUserRound } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { isConfigured } from '../../lib/env';
import { ROLE_LABELS } from '../../lib/types';
import { initials } from '../../lib/validation';
import { friendlyError } from '../../lib/errors';
import { useToast } from '../Toaster';
import { buttonClass, cx } from '../ui';
import { BrandLoader, BrandMark } from '../brand/Brand';
import { MAIN_NAV, MOBILE_TABS, ROLE_NAV, type NavItem } from './nav';
import { notificationLink, timeAgo, useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from '../../lib/notifications';

function isActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`) ||
    (to === '/discover' && pathname.startsWith('/events/'));
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx('group flex items-center gap-2.5 rounded-xl', className)} aria-label="CampusSync home">
      <BrandMark size={38} className="-my-1" />
      <span className="font-display text-[19px] font-extrabold tracking-tight text-plum">
        Campus<span className="text-terracotta">Sync</span>
      </span>
    </Link>
  );
}

function DesktopNav({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
      {items.map(item => {
        const active = isActive(pathname, item.to);
        return (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}
                   className={cx('relative rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors',
                     active ? 'text-plum' : 'text-plum-soft hover:text-plum')}>
            {active && (
              <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-xl bg-peach ring-1 ring-terracotta/15"
                           transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
            )}
            <span className="relative flex items-center gap-1.5">
              <item.icon className={cx('size-4', active ? 'text-terracotta' : 'text-plum-muted')} aria-hidden />
              {item.label}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function NotificationsMenu() {
  // Real in-app notifications (RLS: own inbox only). No count when signed out.
  const { session } = useAuth();
  const navigate = useNavigate();
  const unread = useUnreadCount();
  const list = useNotifications(15);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const count = unread.data ?? 0;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
        className="relative grid size-10 place-items-center rounded-xl text-plum-soft transition hover:bg-cream hover:text-plum data-[state=open]:bg-cream">
        <Bell className="size-5" />
        {count > 0 && (
          <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-terracotta px-1 text-[10px] leading-4 font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8}
          className="z-50 max-h-[70vh] w-[min(92vw,22rem)] overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-float">
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="font-display text-base font-bold">Notifications</p>
            {count > 0 && (
              <button type="button" onClick={() => markAll.mutate()} className="text-xs font-semibold text-terracotta-deep hover:underline">Mark all as read</button>
            )}
          </div>
          {!isConfigured || !session ? (
            <p className="m-2 flex items-start gap-3 rounded-xl bg-cream p-3 text-sm text-plum-soft"><BellOff className="mt-0.5 size-4 shrink-0" aria-hidden />Sign in to see your notifications.</p>
          ) : !list.data?.length ? (
            <p className="m-2 flex items-start gap-3 rounded-xl bg-cream p-3 text-sm text-plum-soft"><BellOff className="mt-0.5 size-4 shrink-0" aria-hidden />You’re all caught up.</p>
          ) : list.data.map(n => (
            <DropdownMenu.Item key={n.id}
              onSelect={() => { if (!n.is_read) markRead.mutate(n.id); const to = notificationLink(n); if (to) navigate(to); }}
              className={cx('flex cursor-pointer gap-3 rounded-xl px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-cream', !n.is_read && 'bg-peach/50')}>
              <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-terracotta')} aria-hidden />
              <span className="min-w-0">
                <span className="block font-semibold">{n.title}</span>
                <span className="block text-plum-soft">{n.message}</span>
                <span className="block text-xs text-plum-muted">{timeAgo(n.created_at)}</span>
              </span>
            </DropdownMenu.Item>
          ))}
          {isConfigured && session && (
            <DropdownMenu.Item onSelect={() => navigate('/notifications')}
              className="mt-1 block cursor-pointer rounded-xl px-3 py-2 text-center text-sm font-semibold text-terracotta-deep outline-none data-[highlighted]:bg-cream">
              See all notifications
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function AccountMenu() {
  const { session, profile, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  if (!isConfigured) {
    return (
      <span className="hidden items-center gap-1.5 rounded-xl bg-amber-bg px-3 py-2 text-xs font-bold text-amber sm:flex" title="Add Supabase keys to .env.local to enable accounts">
        <FlaskConical className="size-4" aria-hidden /> Sample mode
      </span>
    );
  }
  if (!session) {
    return (
      <div className="flex items-center gap-2">
        {/* Phones get "Sign in" in the bottom tab bar instead. A wrapper is used
            because the button's own inline-flex would override `hidden`. */}
        <span className="hidden sm:block">
          <Link to="/login" className={buttonClass('ghost', 'sm')}><LogIn className="size-4" />Sign in</Link>
        </span>
        <Link to="/signup" className={buttonClass('primary', 'sm')}>Join</Link>
      </div>
    );
  }
  const name = profile?.full_name ?? session.user.email ?? 'Account';
  const roleNav = profile ? ROLE_NAV[profile.role] : undefined;
  const onSignOut = async () => {
    try { await signOut(); toast('You have been signed out.', 'info'); navigate('/'); }
    catch (e) { toast(friendlyError(e), 'error'); }
  };
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2.5 rounded-xl p-1 pr-2 text-left transition hover:bg-cream data-[state=open]:bg-cream" aria-label={`Account menu for ${name}`}>
        <span className="grid size-9 place-items-center rounded-[11px] bg-blush text-[12px] font-extrabold text-terracotta-deep">{initials(name)}</span>
        <span className="hidden min-w-0 md:block">
          <span className="block max-w-36 truncate text-sm font-bold text-plum">{name}</span>
          <span className="block text-[11px] text-plum-soft">{profile ? ROLE_LABELS[profile.role] : 'Profile unavailable'}</span>
        </span>
        <ChevronDown className="hidden size-4 text-plum-muted md:block" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-56 rounded-2xl border border-line bg-white p-1.5 shadow-float">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-bold">{name}</p>
            <p className="truncate text-xs text-plum-soft">{session.user.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item onSelect={() => navigate('/profile')} className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm outline-none data-[highlighted]:bg-cream">
            <UserRound className="size-4 text-plum-soft" /> Profile & interests
          </DropdownMenu.Item>
          {roleNav && (
            <DropdownMenu.Item onSelect={() => navigate(roleNav.to)} className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm outline-none data-[highlighted]:bg-cream">
              <roleNav.icon className="size-4 text-plum-soft" /> {roleNav.label}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item onSelect={onSignOut} className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-terracotta-deep outline-none data-[highlighted]:bg-peach">
            <LogOut className="size-4" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MobileTabBar() {
  const { pathname } = useLocation();
  const { session } = useAuth();
  const accountTo = !isConfigured || session ? '/profile' : '/login';
  const tabs: NavItem[] = [...MOBILE_TABS, { to: accountTo, label: session || !isConfigured ? 'Account' : 'Sign in', icon: CircleUserRound }];
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map(t => {
          const active = isActive(pathname, t.to) || (t.label === 'Sign in' && ['/login', '/signup'].includes(pathname));
          return (
            <li key={t.label}>
              <Link to={t.to} aria-current={active ? 'page' : undefined}
                    className="relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold">
                {active && <motion.span layoutId="tab-dot" className="absolute top-0 h-[3px] w-8 rounded-b-full bg-terracotta" />}
                <t.icon className={cx('size-[22px] transition-colors', active ? 'text-terracotta' : 'text-plum-muted')} aria-hidden />
                <span className={active ? 'text-plum' : 'text-plum-soft'}>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell() {
  const { profile } = useAuth();
  const location = useLocation();
  const roleNav = profile ? ROLE_NAV[profile.role] : undefined;
  const navItems = roleNav ? [...MAIN_NAV, roleNav] : MAIN_NAV;

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:shadow-lift">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-line/80 bg-ivory/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <DesktopNav items={navItems} />
          <div className="flex items-center gap-1.5">
            <NotificationsMenu />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main id="main" className="pb-tabbar flex-1">
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}>
            {/* Pages load on demand (code splitting); show a spinner meanwhile. */}
            <Suspense fallback={<BrandLoader className="min-h-[50vh]" />}>
              <Outlet />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="hidden border-t border-line bg-cream/60 lg:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-8 text-sm text-plum-soft">
          <div className="flex items-center gap-3"><Logo /><span>Make space for what matters.</span></div>
          <nav aria-label="Footer" className="flex gap-6">
            <Link to="/discover" className="hover:text-plum">Events</Link>
            <Link to="/clubs" className="hover:text-plum">Clubs</Link>
            <Link to="/timetable" className="hover:text-plum">Timetable</Link>
          </nav>
          <span>© 2026 CampusSync</span>
        </div>
      </footer>
      <MobileTabBar />
    </div>
  );
}
