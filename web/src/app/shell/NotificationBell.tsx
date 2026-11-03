// Bell with unread count; dropdown with the latest 5 notifications and a link to /notifications.
import { useState } from 'react';
import { Bell, Inbox } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { Notification, Paginated } from '@shared/types';
import { DropdownMenu } from '../../components';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLocale, useT } from '../../lib/i18n';
import { cn } from '../../lib/cn';
import { UNREAD_KEY, useUnread } from './useUnread';

export function NotificationBell({ className }: { className?: string }) {
  const t = useT();
  const { status } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const unread = useUnread();
  const { formatRelative } = useLocale();
  const [open, setOpen] = useState(false);

  const latest = useQuery({
    queryKey: ['notifications', 'list', { pageSize: 5 }],
    queryFn: () => api<Paginated<Notification> & { unreadCount: number }>('/api/notifications', { query: { pageSize: 5 } }),
    enabled: status === 'authed' && open,
    staleTime: 15_000,
  });

  if (status !== 'authed') return null;
  const count = unread.notifications;
  const items = (latest.data?.items ?? []).map((n) => ({
    label: n.title,
    description: n.body ?? undefined,
    meta: formatRelative(n.createdAt),
    unread: !n.readAt,
    onSelect: async () => {
      if (!n.readAt) {
        await api(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
        qc.invalidateQueries({ queryKey: UNREAD_KEY });
        qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
      }
      if (n.link) navigate(n.link);
    },
  }));
  const menuItems = [
    ...items,
    { label: items.length ? t('notifications.viewAll') : t('notifications.empty'), icon: <Inbox />, onSelect: () => navigate('/notifications') },
  ];

  return (
    <DropdownMenu
      align="end"
      onOpenChange={setOpen}
      items={menuItems}
      trigger={
        <button
          type="button"
          aria-label={count ? t('nav.notificationsWithCount', { count }) : t('nav.notifications')}
          className={cn('relative flex size-10 items-center justify-center rounded-ctl text-ink-2 transition-colors duration-token-fast hover:bg-sunken hover:text-ink', className)}
        >
          <Bell className="size-5" strokeWidth={1.75} aria-hidden />
          {count > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-[10px] font-semibold leading-none text-on-accent tnum">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      }
    />
  );
}

export default NotificationBell;
