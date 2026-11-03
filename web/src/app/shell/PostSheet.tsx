// 发布 entry (DESIGN.md §6.4): four options; anon → login, L0 → edu verification nudge first.
import { ChevronRight, House, Search, ShoppingBag, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Modal } from '../../components';
import { useAuth } from '../../lib/auth';
import { useCampus } from '../../lib/campus';
import { useT } from '../../lib/i18n';
import { track } from '../../lib/track';
import { loginPath } from '../guards';
import { usePostSheet } from './shellStore';

const OPTIONS = [
  { key: 'listing', path: '/post/listing', Icon: House },
  { key: 'wanted', path: '/post/wanted', Icon: Search },
  { key: 'item', path: '/post/item', Icon: ShoppingBag },
  { key: 'buddy', path: '/post/buddy', Icon: Users },
] as const;

export function PostSheet() {
  const { isOpen, close } = usePostSheet();
  const t = useT();
  const { user, status } = useAuth();
  const { campus } = useCampus();
  const navigate = useNavigate();

  const go = (path: string, key: string) => {
    close();
    track('post.start', { type: key });
    if (status !== 'authed' || !user) return navigate(loginPath(path));
    if ((user.trustLevel ?? 0) < 1) return navigate(`/verify-email?reason=post&next=${encodeURIComponent(path)}`);
    navigate(path);
  };

  return (
    <Modal open={isOpen} onClose={close} title={t('post.title')} size="sm">
      <ul className="-mx-1 flex flex-col">
        {OPTIONS.map(({ key, path, Icon }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => go(path, key)}
              className="flex h-16 w-full items-center gap-3 rounded-card px-3 text-left transition-colors duration-token-fast hover:bg-sunken"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-sunken text-ink">
                <Icon className="size-6" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold text-ink">{t(`post.${key}.title`)}</span>
                <span className="block truncate text-small text-ink-2">{t(`post.${key}.description`)}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-caption text-ink-3">
        {campus ? t('post.currentCampus', { campus: campus.shortName }) : t('post.noCampus')}{' '}
        <Link to="/welcome" onClick={close} className="text-accent-text hover:underline">
          {t('common.change')}
        </Link>
      </p>
    </Modal>
  );
}

export default PostSheet;
