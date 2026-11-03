// Desktop footer: 帮助 · 安全中心 · 条款 · 隐私 · 申请添加校区 · 中/EN · © year.
import { Link } from 'react-router';
import { Mark } from '../../components/brand';
import { NAME_DISPLAY } from '@shared/brand';
import { useT } from '../../lib/i18n';
import { LangToggle } from './LangToggle';

export function Footer() {
  const t = useT();
  const year = new Date().getFullYear();
  const links = [
    { to: '/help', label: t('nav.help') },
    { to: '/safety', label: t('nav.safety') },
    { to: '/terms', label: t('nav.terms') },
    { to: '/privacy', label: t('nav.privacy') },
    { to: '/help#campus-request', label: t('nav.requestCampus') },
  ];
  return (
    <footer className="hidden border-t border-line bg-paper md:block">
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-6 gap-y-3 px-4 py-8 text-small text-ink-3 lg:px-8">
        <span className="flex items-center gap-2 text-ink-2">
          <Mark size={20} />
          <span>{NAME_DISPLAY}</span>
        </span>
        <nav aria-label={t('nav.footer')} className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto flex items-center gap-4">
          <LangToggle />
          <span>© {year}</span>
        </span>
      </div>
    </footer>
  );
}

export default Footer;
