// Scam-warning banner (DESIGN.md §4.9): warning-soft, triangle-alert, 2 lines max, 了解更多 → /safety, dismissible.
// Shown while the thread has ≤ 3 messages and the member has not dismissed it; cannot be disabled by payment.
import { Link } from 'react-router';
import { TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components';
import { useT } from '@/lib/i18n';

export function ScamBanner({ onDismiss }: { onDismiss: () => void }) {
  const t = useT();
  return (
    <div role="note" className="mx-3 mt-3 flex items-start gap-2 rounded-card bg-warning-soft px-3 py-2 text-warning md:mx-4">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden strokeWidth={1.75} />
      <p className="min-w-0 flex-1 text-small leading-snug">
        <span className="font-semibold">{t('chat.scam.title')}</span>
        {' · '}
        {t('scam.banner')}{' '}
        <Link to="/safety" className="font-medium underline underline-offset-2">
          {t('chat.scam.more')}
        </Link>
      </p>
      <Button variant="ghost" size="sm" iconOnly aria-label={t('chat.scam.dismiss')} onClick={onDismiss} className="-mr-1 size-7 shrink-0 text-warning hover:text-warning">
        <X />
      </Button>
    </div>
  );
}
