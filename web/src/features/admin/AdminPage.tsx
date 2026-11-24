import { useMemo, useState } from 'react';
import { Building2, CalendarRange, ClipboardList, GraduationCap, ScrollText, Search, ShieldCheck, Trash2, UserPlus, Users, UsersRound, FlaskConical, Ticket, Percent } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Button, Card, EmptyState, FormStatus, PageHeader, Select, Skeleton, cx } from '../../components/ui';
import { StatCard } from '../../components/StatCard';
import { BarTimeline, HBarChart } from '../../components/charts';
import { useAdminDashboard } from '../../lib/dashboards';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toaster';
import { isConfigured } from '../../lib/env';
import { friendlyError } from '../../lib/errors';
import { ROLE_LABELS, type AppRole } from '../../lib/types';
import { type ClubWithMembers, useAddClubManager, useAllUsers, useAuditLog, useClubsWithMembers, useRemoveMember, useSetActive, useSetRole } from '../../lib/admin';

type Tab = 'overview' | 'users' | 'clubs' | 'audit';

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('overview');
  if (!isConfigured) return <NotConnected />;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <PageHeader kicker="Platform operations" title="Admin">Manage people, roles and clubs. Every role change is recorded in the audit log.</PageHeader>
      <div className="mb-6">
        <Tabs label="Admin sections" layoutId="admin-tab" value={tab} onChange={setTab} items={[
          { id: 'overview', label: 'Overview', icon: ClipboardList },
          { id: 'users', label: 'Users & roles', icon: Users },
          { id: 'clubs', label: 'Club leads', icon: UsersRound },
          { id: 'audit', label: 'Audit log', icon: ScrollText },
        ]} />
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'users' && <UsersTab />}
      {tab === 'clubs' && <ClubsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

function NotConnected() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <PageHeader kicker="Platform operations" title="Admin" />
      <Card className="flex items-start gap-3 p-6 text-plum-soft"><FlaskConical className="mt-0.5 size-5 text-amber" aria-hidden /><p>Admin tools need the backend. Connect Supabase to use them.</p></Card>
    </div>
  );
}

function Overview() {
  // Every number comes from admin_dashboard(): one aggregate query in the
  // database, which first checks that the caller is an admin.
  const q = useAdminDashboard();
  if (q.isError) return <FormStatus kind="error">{friendlyError(q.error)}</FormStatus>;
  const d = q.data;
  const roles = d?.users_by_role ?? {};
  const statusOrder = ['draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'published', 'completed', 'rejected', 'cancelled'];
  const fmtDay = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
  const timeline = (d?.registrations_14d ?? []).map(r => {
    const date = new Date(`${r.day}T00:00:00`);
    return { label: fmtDay.format(date), short: String(date.getDate()), value: r.n };
  });
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={roles.student ?? (d ? 0 : undefined)} icon={GraduationCap} loading={!d} />
        <StatCard label="Organizers" value={roles.organizer ?? (d ? 0 : undefined)} icon={UsersRound} loading={!d} hint="Need a club lead role to manage events" />
        <StatCard label="Active clubs" value={d?.active_clubs} icon={Building2} loading={!d} hint={d ? `${d.venues} venues` : undefined} />
        <StatCard label="Upcoming events" value={d?.upcoming_published} icon={CalendarRange} loading={!d} hint="Published, not yet ended" />
        <StatCard label="Active registrations" value={d?.registrations_active} icon={Ticket} loading={!d} />
        <StatCard label="Attendance rate" value={d ? (d.attendance_rate === null ? '—' : `${d.attendance_rate}%`) : undefined} icon={Percent} loading={!d}
                  hint={d ? `${d.attendance_verified} verified check-ins` : undefined} />
        <StatCard label="OD pending" value={d ? (d.od_by_status.pending ?? 0) : undefined} icon={ClipboardList} loading={!d}
                  hint={d ? `${d.od_by_status.approved ?? 0} approved · ${d.od_by_status.rejected ?? 0} rejected` : undefined} />
        <StatCard label="DSA & admins" value={d ? (roles.dsa ?? 0) + (roles.admin ?? 0) : undefined} icon={ShieldCheck} loading={!d} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-base font-bold">Registrations per day</h3>
          <p className="mb-3 text-xs text-plum-muted">Last 14 days, campus time</p>
          {d ? <BarTimeline data={timeline} valueLabel="Registrations" /> : <Skeleton className="h-48" />}
        </Card>
        <Card className="p-5">
          <h3 className="text-base font-bold">Events by category</h3>
          <p className="mb-3 text-xs text-plum-muted">Published and completed events</p>
          {!d ? <Skeleton className="h-48" />
            : !d.events_by_category.length ? <p className="text-sm text-plum-soft">No published events yet.</p>
            : <HBarChart data={d.events_by_category.map(c => ({ label: c.category, value: c.n }))} valueLabel="Events" />}
        </Card>
      </div>

      {d && (
        <Card className="p-5">
          <h3 className="text-base font-bold">Events by status</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {statusOrder.filter(s => d.events_by_status[s]).map(s => (
              <li key={s}><Badge tone="neutral" className="px-3 py-1.5 text-xs">{s.replace('_', ' ')} · {d.events_by_status[s]}</Badge></li>
            ))}
            {!Object.keys(d.events_by_status).length && <li className="text-sm text-plum-soft">No events yet.</li>}
          </ul>
        </Card>
      )}
    </div>
  );
}

function UsersTab() {
  const users = useAllUsers();
  const { session } = useAuth();
  const setRole = useSetRole();
  const setActive = useSetActive();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<AppRole | 'all'>('all');
  const rows = useMemo(() => (users.data ?? []).filter(u =>
    (roleFilter === 'all' || u.role === roleFilter) &&
    `${u.full_name} ${u.email} ${u.registration_number ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())), [users.data, q, roleFilter]);

  if (users.isError) return <FormStatus kind="error">{friendlyError(users.error)}</FormStatus>;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <label className="relative min-w-0 flex-1 basis-60">
          <span className="sr-only">Search users</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-plum-muted" aria-hidden />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or registration no."
                 className="h-10 w-full rounded-xl border border-line bg-field pr-3 pl-9 text-sm focus:border-plum focus:bg-white focus:outline-none" />
        </label>
        <Select aria-label="Filter by role" value={roleFilter} onChange={e => setRoleFilter(e.target.value as AppRole | 'all')} className="h-10 min-h-0 w-auto text-sm">
          <option value="all">All roles</option>
          {(Object.keys(ROLE_LABELS) as AppRole[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </Select>
        <span className="text-xs text-plum-muted">{rows.length} shown</span>
      </div>
      {!users.data ? <div className="grid gap-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div> : (
        <ul className="divide-y divide-line">
          {rows.map(u => {
            const self = u.id === session?.user.id;
            return (
              <li key={u.id} className={cx('flex flex-wrap items-center gap-3 px-4 py-3', !u.is_active && 'opacity-60')}>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate font-semibold">{u.full_name} {self && <Badge tone="muted" className="ml-1">You</Badge>} {!u.is_active && <Badge tone="amber" className="ml-1">Deactivated</Badge>}</p>
                  <p className="truncate text-xs text-plum-soft">{u.email}{u.registration_number && ` · ${u.registration_number}`}{u.department && ` · ${u.department.code}`}</p>
                </div>
                <Select aria-label={`Role for ${u.full_name}`} value={u.role} disabled={self || setRole.isPending}
                        title={self ? 'Admins cannot change their own role' : undefined}
                        onChange={e => setRole.mutate({ userId: u.id, role: e.target.value as AppRole }, {
                          onSuccess: () => toast(`${u.full_name} is now ${ROLE_LABELS[e.target.value as AppRole]}.`, 'success'),
                          onError: err => toast(friendlyError(err), 'error'),
                        })}
                        className="h-10 min-h-0 w-36 text-sm">
                  {(Object.keys(ROLE_LABELS) as AppRole[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </Select>
                <Button variant="ghost" size="sm" disabled={self || setActive.isPending}
                        onClick={() => setActive.mutate({ userId: u.id, active: !u.is_active }, {
                          onSuccess: () => toast(u.is_active ? `${u.full_name} deactivated.` : `${u.full_name} reactivated.`, 'success'),
                          onError: err => toast(friendlyError(err), 'error'),
                        })}>
                  {u.is_active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </li>
            );
          })}
          {rows.length === 0 && <li className="p-8 text-center text-sm text-plum-soft">No users match.</li>}
        </ul>
      )}
    </Card>
  );
}

function ClubsTab() {
  const clubs = useClubsWithMembers();
  const users = useAllUsers();
  const organizers = (users.data ?? []).filter(u => u.role === 'organizer' && u.is_active);
  if (clubs.isError) return <FormStatus kind="error">{friendlyError(clubs.error)}</FormStatus>;
  return (
    <div className="grid gap-4">
      <p className="rounded-2xl border border-line bg-white p-4 text-sm text-plum-soft">
        An organizer can manage a club’s events only if they have the <strong className="text-plum">Organizer</strong> role
        <em> and</em> are an active <strong className="text-plum">lead</strong> or <strong className="text-plum">coordinator</strong> of that club. The database checks both.
      </p>
      {!clubs.data ? <Skeleton className="h-64" /> : clubs.data.map(c => <ClubRow key={c.id} club={c} organizers={organizers} />)}
    </div>
  );
}

function ClubRow({ club, organizers }: { club: ClubWithMembers; organizers: Array<{ id: string; full_name: string; email: string }> }) {
  const add = useAddClubManager();
  const remove = useRemoveMember();
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'lead' | 'coordinator'>('lead');
  const managers = club.club_members.filter(m => m.membership_role !== 'member');
  const available = organizers.filter(o => !club.club_members.some(m => m.user?.id === o.id));

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-terracotta to-terracotta-deep font-display font-extrabold text-white">{club.short_name}</span>
          <div><h3 className="text-base">{club.name}</h3><p className="text-xs text-plum-soft">{managers.length} {managers.length === 1 ? 'manager' : 'managers'}</p></div>
        </div>
        <form className="flex flex-wrap items-center gap-2" onSubmit={e => {
          e.preventDefault();
          if (!userId) return;
          add.mutate({ clubId: club.id, userId, role }, {
            onSuccess: () => { toast('Club manager added.', 'success'); setUserId(''); },
            onError: err => toast(friendlyError(err), 'error'),
          });
        }}>
          <Select aria-label={`Organizer to add to ${club.name}`} value={userId} onChange={e => setUserId(e.target.value)} className="h-10 min-h-0 w-52 text-sm">
            <option value="">{available.length ? 'Choose an organizer' : 'No unassigned organizers'}</option>
            {available.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
          </Select>
          <Select aria-label="Club role" value={role} onChange={e => setRole(e.target.value as 'lead' | 'coordinator')} className="h-10 min-h-0 w-36 text-sm">
            <option value="lead">Lead</option><option value="coordinator">Coordinator</option>
          </Select>
          <Button type="submit" size="sm" disabled={!userId} loading={add.isPending}><UserPlus className="size-4" />Add</Button>
        </form>
      </div>
      {managers.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {managers.map(m => (
            <li key={m.id} className="flex items-center gap-2 rounded-full border border-line bg-cream py-1 pr-1 pl-3 text-sm">
              <span className="font-semibold">{m.user?.full_name ?? 'Unknown'}</span>
              <Badge tone={m.membership_role === 'lead' ? 'terracotta' : 'neutral'}>{m.membership_role}</Badge>
              {m.user && m.user.role !== 'organizer' && <Badge tone="amber" className="cursor-help"><span title="Without the Organizer role this membership grants no access">no organizer role</span></Badge>}
              <button type="button" aria-label={`Remove ${m.user?.full_name ?? 'member'}`} disabled={remove.isPending}
                      onClick={() => remove.mutate(m.id, { onSuccess: () => toast('Removed.'), onError: e => toast(friendlyError(e), 'error') })}
                      className="grid size-7 place-items-center rounded-full text-plum-soft hover:bg-white hover:text-terracotta-deep"><Trash2 className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AuditTab() {
  const log = useAuditLog();
  if (log.isError) return <FormStatus kind="error">{friendlyError(log.error)}</FormStatus>;
  if (!log.data) return <Skeleton className="h-64" />;
  if (!log.data.length) return <EmptyState icon={<ScrollText className="size-6" />} title="No audited actions yet">Role changes and other sensitive actions will appear here.</EmptyState>;
  const fmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  return (
    <Card className="overflow-hidden">
      <ol className="divide-y divide-line">
        {log.data.map(r => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <time className="w-40 shrink-0 text-xs text-plum-muted" dateTime={r.created_at}>{fmt.format(new Date(r.created_at))}</time>
            <code className="rounded-md bg-cream px-2 py-0.5 text-xs font-bold text-plum">{r.action}</code>
            <span className="text-plum-soft">by <strong className="text-plum">{r.actor?.full_name ?? 'deleted user'}</strong></span>
            {Object.keys(r.metadata ?? {}).length > 0 && (
              <span className="text-xs text-plum-soft">{Object.entries(r.metadata).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</span>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
