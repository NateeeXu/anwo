// Mobile bottom tab bar (DESIGN.md §6.2): 首页 · 地图 · (+) 发布 · 消息 · 我的.
import { House, Map, MessageCircle, Plus, UserRound } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/cn';
import { loginPath } from '../guards';
import { usePostSheet, useShellStore } from './shellStore';
import { useUnread } from './useUnread';

export function BottomTabs() {
  const t = useT();
  const { pathname } = useLocation();
  const { open } = usePostSheet();
  const { status, user } = useAuth();
  const hide = useShellStore((s) => s.hideTabs);
  const unread = useUnread();
  if (hide) return null;

  const mePath = status === 'authed' && user ? '/settings' : loginPath('/settings');
  const tabs = [
    { key: 'home', to: '/', label: t('nav.home'), Icon: House, active: pathname === '/' },
    { key: 'map', to: '/map', label: t('nav.map'), Icon: Map, active: pathname.startsWith('/map') },
    { key: 'post' },
    { key: 'chat', to: '/chat', label: t('nav.chat'), Icon: MessageCircle, active: pathname.startsWith('/chat'), count: unread.messages },
    { key: 'me', to: mePath, label: t('nav.me'), Icon: UserRound, active: pathname.startsWith('/settings') || pathname.startsWith('/u/') },
  ] as const;

  return (
    <nav aria-label={t('nav.primary')} className="fixed inset-x-0 bottom-0 z-layer-nav border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid h-[60px] grid-cols-5">
        {tabs.map((tab) => {
          if (tab.key === 'post') {
            return (
              <li key="post" className="flex items-start justify-center">
                <button
                  type="button"
                  onClick={open}
                  aria-label={t('nav.post')}
                  className="-mt-1.5 flex size-11 items-center justify-center rounded-pill bg-accent text-on-accent shadow-md transition-colors duration-token-fast hover:bg-accent-hover active:bg-accent-active"
                >
                  <Plus className="size-6" strokeWidth={2} aria-hidden />
                </button>
              </li>
            );
          }
          const { Icon } = tab;
          const count = 'count' in tab ? tab.count : 0;
          return (
            <li key={tab.key}>
              <Link
                to={tab.to}
                aria-current={tab.active ? 'page' : undefined}
                className={cn('relative flex h-full flex-col items-center justify-center gap-0.5 text-caption', tab.active ? 'text-ink' : 'text-ink-3')}
              >
                <Icon className="size-6" strokeWidth={1.75} fill={tab.active ? 'currentColor' : 'none'} fillOpacity={tab.active ? 0.15 : 0} aria-hidden />
                <span>{tab.label}</span>
                {count > 0 && (
                  <span className="absolute left-1/2 top-1.5 ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-[10px] font-semibold leading-none text-on-accent tnum">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default BottomTabs;
