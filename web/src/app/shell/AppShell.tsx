// App shell layout route (DESIGN.md §6): desktop top nav / mobile top bar + bottom tabs, content, footer.
// Route objects may set `handle: { layout: 'default' | 'full' | 'bare', hideTabs?: boolean }`; pages may
// also call useShellOptions() for the same effect at runtime.
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { Outlet, ScrollRestoration, useLocation, useMatches } from 'react-router';
import { useT } from '../../lib/i18n';
import { track } from '../../lib/track';
import { cn } from '../../lib/cn';
import { ErrorBoundary } from '../ErrorBoundary';
import { BottomTabs } from './BottomTabs';
import { Footer } from './Footer';
import { PostSheet } from './PostSheet';
import { MobileTopBar, TopNav } from './TopNav';
import { useShellStore, type ShellLayout } from './shellStore';

type Handle = { layout?: ShellLayout; hideTabs?: boolean };

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function AppShell() {
  const t = useT();
  const matches = useMatches();
  const location = useLocation();
  const storeLayout = useShellStore((s) => s.layout);
  const storeHide = useShellStore((s) => s.hideTabs);
  const setOptions = useShellStore((s) => s.setOptions);
  const online = useOnline();

  const handle = matches.reduce<Handle>((acc, m) => ({ ...acc, ...((m.handle as Handle | undefined) ?? {}) }), {});
  const layout: ShellLayout = handle.layout ?? storeLayout ?? 'default';
  const hideTabs = handle.hideTabs ?? storeHide;

  // Page-view beacon + reset per-page shell options on navigation.
  useEffect(() => {
    track('pageview', { path: location.pathname + location.search });
    setOptions({ title: '', back: undefined });
  }, [location.pathname, location.search, setOptions]);

  useEffect(() => {
    if (handle.hideTabs !== undefined) setOptions({ hideTabs: handle.hideTabs });
  }, [handle.hideTabs, setOptions]);

  const offline = !online && (
    <div role="status" className="pointer-events-none fixed left-1/2 top-16 z-layer-toast -translate-x-1/2 md:top-20">
      <span className="flex items-center gap-2 rounded-pill bg-inverse px-3 py-1.5 text-small text-ink-inverse shadow-lg">
        <WifiOff className="size-4" aria-hidden />
        {t('error.offline')}
      </span>
    </div>
  );

  if (layout === 'bare') {
    return (
      <div className="min-h-dvh bg-paper">
        <ScrollRestoration />
        {offline}
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
        <PostSheet />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <ScrollRestoration />
      <TopNav />
      <MobileTopBar />
      {offline}
      <main
        id="main"
        className={cn('flex min-w-0 flex-1 flex-col', !hideTabs && 'pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0', layout === 'default' && 'py-4 md:py-6')}
      >
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      {layout === 'default' && <Footer />}
      {!hideTabs && <BottomTabs />}
      <PostSheet />
    </div>
  );
}

export default AppShell;
