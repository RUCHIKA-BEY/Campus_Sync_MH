import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { Button, Card, EmptyState, FormStatus, PageHeader, Skeleton, cx } from '../../components/ui';
import { Tabs } from '../../components/Tabs';
import { friendlyError } from '../../lib/errors';
import { notificationLink, timeAgo, useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from '../../lib/notifications';

type Filter = 'all' | 'unread';

export function NotificationsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const list = useNotifications(100, filter === 'unread');
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHeader kicker="Your updates" title="Notifications"
        actions={(unread.data ?? 0) > 0 && <Button variant="secondary" loading={markAll.isPending} onClick={() => markAll.mutate()}><CheckCheck className="size-4" />Mark all as read</Button>}>
        Registration, approval, On-Duty and check-in updates. In-app only; email and push aren’t set up.
      </PageHeader>
      <div className="mb-5">
        <Tabs label="Filter" layoutId="notif-tab" value={filter} onChange={setFilter} items={[
          { id: 'all', label: 'All', icon: Bell },
          { id: 'unread', label: 'Unread', icon: BellOff, count: unread.data },
        ]} />
      </div>
      {list.isError ? <FormStatus kind="error">{friendlyError(list.error)}</FormStatus>
        : list.isPending ? <Skeleton className="h-64" />
        : !list.data.length ? <EmptyState icon={<Bell className="size-6" />} title={filter === 'unread' ? 'All caught up' : 'No notifications yet'} />
        : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {list.data.map(n => {
                const to = notificationLink(n);
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => { if (!n.is_read) markRead.mutate(n.id); if (to) navigate(to); }}
                      className={cx('flex w-full gap-3 px-4 py-3.5 text-left transition hover:bg-cream', !n.is_read && 'bg-peach/40')}>
                      <span className={cx('mt-2 size-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-terracotta')} aria-label={n.is_read ? undefined : 'Unread'} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{n.title}</span>
                        <span className="block text-sm text-plum-soft">{n.message}</span>
                      </span>
                      <span className="shrink-0 text-xs text-plum-muted">{timeAgo(n.created_at)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
    </div>
  );
}
