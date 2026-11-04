// Admin shell (DESIGN 7.15): left rail on desktop (w-60, bg-surface, border-r), section Select on mobile.
// Nav badges come from /api/admin/nav-counts and refresh on the ws `admin.queue` event.
import { Suspense, useEffect, useMemo, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity, BarChart3, Bus, CircleDollarSign, ClipboardList, Flag, Home, LayoutDashboard, Map as MapIcon, MessagesSquare, School, Search, ShieldCheck,
  ShoppingBag, ToggleRight, Users, UsersRound,
} from 'lucide-react';
import { Select, Skeleton } from '@/components';
import { getWs } from '@/lib/ws';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useShellOptions } from '@/app/shell/shellStore';
import { useNavCounts } from './api';

type NavItem = { to: string; key: string; icon: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>; count?: number; urgent?: boolean };
type NavGroup = { key: string; items: NavItem[] };

export function useAdminNav(): NavGroup[] {
  const { data } = useNavCounts();
  return useMemo(
    () => [
      {
        key: 'ops',
        items: [
          { to: '/admin', key: 'overview', icon: LayoutDashboard },
          { to: '/admin/revenue', key: 'revenue', icon: CircleDollarSign, count: data?.disputedEscrows, urgent: !!data?.disputedEscrows },
          { to: '/admin/users', key: 'users', icon: Users },
          { to: '/admin/verify', key: 'verify', icon: ShieldCheck, count: data?.pendingVerifications },
          { to: '/admin/reports', key: 'reports', icon: Flag, count: data?.openReports, urgent: !!data?.openReports },
        ],
      },
      {
        key: 'content',
        items: [
          { to: '/admin/listings', key: 'listings', icon: Home, count: data?.flaggedListings },
          { to: '/admin/wanted', key: 'wanted', icon: Search },
          { to: '/admin/market', key: 'market', icon: ShoppingBag },
          { to: '/admin/buddy', key: 'buddy', icon: UsersRound },
          { to: '/admin/chat', key: 'chat', icon: MessagesSquare },
          { to: '/admin/shuttle', key: 'shuttle', icon: Bus, count: data?.openShuttleRequests },
          { to: '/admin/map', key: 'map', icon: MapIcon, count: data?.pendingPoiSuggestions },
        ],
      },
      {
        key: 'platform',
        items: [
          { to: '/admin/campuses', key: 'campuses', icon: School, count: data?.openCampusRequests },
          { to: '/admin/flags', key: 'flags', icon: ToggleRight },
          { to: '/admin/audit', key: 'audit', icon: ClipboardList },
          { to: '/admin/system', key: 'system', icon: Activity },
        ],
      },
    ],
    [data],
  );
}

function NavBadge({ n, urgent }: { n?: number; urgent?: boolean }) {
  if (!n) return null;
  return (
    <span className={cn('ml-auto min-w-6 rounded-pill px-1.5 text-center text-caption font-medium tabular-nums', urgent ? 'bg-accent-soft text-accent-text-strong' : 'bg-sunken text-ink-2')}>{n > 99 ? '99+' : n}</span>
  );
}

export default function AdminShell() {
  const t = useT();
  const nav = useAdminNav();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useShellOptions({ layout: 'full' });

  // live queue counters
  useEffect(() => {
    const ws = getWs();
    const off = ws.on('admin.queue', () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'nav-counts'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'reports'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    });
    const offFlags = ws.on('system.flags', () => void qc.invalidateQueries({ queryKey: ['admin', 'flags'] }));
    return () => {
      off();
      offFlags();
    };
  }, [qc]);

  const flat = nav.flatMap((g) => g.items);
  const current = [...flat].sort((a, b) => b.to.length - a.to.length).find((i) => (i.to === '/admin' ? location.pathname === '/admin' || location.pathname === '/admin/' : location.pathname.startsWith(i.to)));

  return (
    <div className="flex min-h-full w-full flex-1">
      <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface md:flex" aria-label={t('admin.nav.label')}>
        <div className="flex items-center gap-2 px-5 pb-2 pt-5">
          <BarChart3 size={18} strokeWidth={1.75} className="text-accent-text" aria-hidden />
          <span className="text-body font-semibold text-ink">{t('admin.title')}</span>
        </div>
        <nav className="flex flex-col gap-4 px-3 pb-6 pt-2">
          {nav.map((g) => (
            <div key={g.key} className="flex flex-col gap-0.5">
              <p className="px-2 pb-1 text-caption font-medium text-ink-3">{t(`admin.nav.group.${g.key}`)}</p>
              {g.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={{ pathname: i.to, search: keepFilters(location.search) }}
                  end={i.to === '/admin'}
                  className={({ isActive }) =>
                    cn(
                      'flex h-9 items-center gap-2.5 rounded-ctl px-2 text-small transition-colors duration-token-fast',
                      isActive ? 'bg-sunken font-medium text-ink' : 'text-ink-2 hover:bg-sunken hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <i.icon size={16} strokeWidth={1.75} aria-hidden />
                      <span className="truncate">{t(`admin.nav.${i.key}`)}</span>
                      {isActive && <span className="sr-only">{t('admin.nav.current')}</span>}
                      <NavBadge n={i.count} urgent={i.urgent} />
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-14 z-[3] border-b border-line bg-surface px-4 py-2 md:hidden">
          <Select
            aria-label={t('admin.nav.label')}
            size="sm"
            value={current?.to ?? '/admin'}
            options={flat.map((i) => ({ value: i.to, label: `${t(`admin.nav.${i.key}`)}${i.count ? ` · ${i.count}` : ''}`, text: t(`admin.nav.${i.key}`) }))}
            onChange={(to) => navigate({ pathname: to, search: keepFilters(location.search) })}
          />
        </div>
        <main id="admin-main" className="mx-auto w-full max-w-[1280px] min-w-0 px-4 py-5 md:px-8 md:py-7">
          <Suspense fallback={<AdminPageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

/** Keep campus + range filters when switching sections; drop page-specific params. */
function keepFilters(search: string): string {
  const p = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const k of ['cid', 'range', 'from', 'to']) {
    const v = p.get(k);
    if (v) out.set(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : '';
}

export function AdminPageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy>
      <Skeleton variant="rect" width={220} height={32} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="rect" height={96} />
        ))}
      </div>
      <Skeleton variant="rect" height={260} />
    </div>
  );
}
