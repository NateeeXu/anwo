// 安全中心 Safety center: scam patterns, never pay off-platform, how escrow works, how to report.
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { useT } from '../lib/i18n';
import { TextPage } from './static/TextPage';

export default function Safety() {
  const t = useT();
  return (
    <TextPage
      prefix="safety"
      sections={6}
      aside={
        <div className="mt-6 flex items-start gap-3 rounded-card bg-warning-soft p-4 text-body text-warning">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>{t('scam.banner')}</p>
        </div>
      }
    >
      <div className="mt-10 flex items-start gap-3 rounded-card border border-line bg-surface p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden />
        <p className="text-body text-ink-2">
          {t('safety.cta')}{' '}
          <Link to="/verify" className="text-accent-text hover:underline">{t('verify.title')}</Link>
          {' · '}
          <Link to="/help" className="text-accent-text hover:underline">{t('nav.help')}</Link>
        </p>
      </div>
    </TextPage>
  );
}
