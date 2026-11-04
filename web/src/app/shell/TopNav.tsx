// Desktop top nav (DESIGN.md §6.1) and the mobile top bar (§6.2).
import { ChevronLeft, MessageCircle, Plus, Search } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Lockup, Mark } from '../../components/brand';
import { Button } from '../../components';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { useUnreadMessages } from '../../features/chat/hooks';
import { useT } from '../../lib/i18n';
import { CampusSwitcher } from './CampusSwitcher';
import { GlobalSearch } from './GlobalSearch';
import { LangToggle } from './LangToggle';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';
import { usePostSheet, useShellStore } from './shellStore';

/** Paths that are "root" pages on mobile (no back chevron). */
const ROOT_PATHS = ['/', '/map', '/chat', '/settings', '/listings', '/wanted', '/market', '/buddy', '/shuttle', '/search', '/notifications'];

export function TopNav() {
  const t = useT();
  const { open } = usePostSheet();
  return (
    <header className="sticky top-0 z-layer-nav hidden h-16 border-b border-line bg-surface md:block">
      <div className="mx-auto flex h-full max-w-content items-center gap-4 px-4 lg:px-8">
        <Link to="/" className="shrink-0 rounded-sm" aria-label={t('nav.home')}>
          <Lockup size={32} />
        </Link>
        <CampusSwitcher />
        <GlobalSearch className="mx-2 min-w-0 flex-1 lg:mx-6 lg:max-w-[520px]" />
        <Button variant="primary" size="md" iconLeft={<Plus />} onClick={open} className="shrink-0">
          {t('nav.post')}
        </Button>
        <LangToggle className="hidden lg:block" />
        <ChatButton />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}

/** Desktop 消息 entry with the chat module's unread badge (the bottom tab plays this role on mobile). */
function ChatButton() {
  const t = useT();
  const { status } = useAuth();
  const { pathname } = useLocation();
  const count = useUnreadMessages();
  if (status !== 'authed') return null;
  return (
    <Link
      to="/chat"
      aria-label={count ? t('nav.chatWithCount', { count }) : t('nav.chat')}
      aria-current={pathname.startsWith('/chat') ? 'page' : undefined}
      className={cn('relative flex size-10 shrink-0 items-center justify-center rounded-ctl transition-colors duration-token-fast hover:bg-sunken hover:text-ink', pathname.startsWith('/chat') ? 'text-ink' : 'text-ink-2')}
    >
      <MessageCircle className="size-5" strokeWidth={1.75} aria-hidden />
      {count > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-[10px] font-semibold leading-none text-on-accent tnum">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

export function MobileTopBar() {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const title = useShellStore((s) => s.title);
  const back = useShellStore((s) => s.back);
  const isRoot = ROOT_PATHS.includes(pathname);
  const showBack = back ?? !isRoot;
  return (
    <header className="sticky top-0 z-layer-nav flex h-14 items-center gap-2 border-b border-line bg-surface px-2 md:hidden">
      <div className="flex w-[132px] shrink-0 items-center">
        {showBack ? (
          <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label={t('common.back')} className="flex size-10 items-center justify-center rounded-ctl text-ink">
            <ChevronLeft className="size-6" aria-hidden />
          </button>
        ) : (
          <CampusSwitcher compact />
        )}
      </div>
      <h1 className="min-w-0 flex-1 truncate text-center text-h3 text-ink">
        {pathname === '/' ? <Mark size={24} className="mx-auto" /> : title}
      </h1>
      <div className="flex w-[132px] shrink-0 items-center justify-end">
        <button type="button" onClick={() => navigate('/search')} aria-label={t('nav.search')} className="flex size-10 items-center justify-center rounded-ctl text-ink-2 hover:text-ink">
          <Search className="size-5" strokeWidth={1.75} aria-hidden />
        </button>
        <NotificationBell />
      </div>
    </header>
  );
}

export default TopNav;
