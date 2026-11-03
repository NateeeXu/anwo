// SecurePaymentCta — the 「安心付押金」 entry point for listing detail pages and chat context cards (billing-requirements §10).
//   <SecurePaymentCta listingId={listing.id} counterpartyId={tenantId /* only when the host starts it from chat */} />
// Renders nothing while loading or when the feature is off for the campus and the viewer is the host; otherwise one of:
// a primary link to /escrow/new, the existing open Secure Payment, or an honest "not available yet" note.
import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { useEscrowEligibility } from '../api';

export function SecurePaymentCta({ listingId, counterpartyId, className, compact }: { listingId: string; counterpartyId?: string; className?: string; compact?: boolean }) {
  const t = useT();
  const { formatMoney } = useLocale();
  const { status, user } = useAuth();
  const q = useEscrowEligibility(status === 'authed' ? listingId : null);
  if (status !== 'authed') {
    return (
      <p className={cn('flex items-start gap-2 text-caption text-ink-3', className)}>
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <span>{t('billing.secure.ctaAnon')} <Link to={`/login?next=${encodeURIComponent(`/listings/${listingId}`)}`} className="text-accent-text underline">{t('nav.login')}</Link></span>
      </p>
    );
  }
  const d = q.data;
  if (!d) return null;
  if (!d.enabled) return <p className={cn('text-caption text-ink-3', className)}>{t('billing.secure.comingTo', { state: d.state ?? '' })}</p>;
  if (d.existing) {
    return (
      <Button asChild variant="secondary" size={compact ? 'sm' : 'md'} iconLeft={<ShieldCheck />} className={className}>
        <Link to={`/escrow/${d.existing.id}`}>{t('billing.secure.ctaExisting')}</Link>
      </Button>
    );
  }
  if (!d.payeeEligible) {
    return (
      <p className={cn('flex items-start gap-2 rounded-sm bg-sunken px-3 py-2 text-caption text-ink-2', className)}>
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
        <span>{t('billing.secure.payeeNotEligibleShort')}</span>
      </p>
    );
  }
  if (!counterpartyId && !d.viewerCanPropose) {
    if ((user?.trustLevel ?? 0) >= 2) return null; // the host on their own listing starts from the chat instead
    return (
      <p className={cn('flex items-start gap-2 text-caption text-ink-3', className)}>
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <span>{t('billing.secure.ctaVerify')} <Link to={`/verify?next=${encodeURIComponent(`/listings/${listingId}`)}`} className="text-accent-text underline">{t('billing.secure.ctaVerifyLink')}</Link></span>
      </p>
    );
  }
  const qs = new URLSearchParams({ listingId, ...(counterpartyId ? { counterpartyId } : {}) });
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Button asChild variant="secondary" size={compact ? 'sm' : 'md'} iconLeft={<ShieldCheck />}>
        <Link to={`/escrow/new?${qs.toString()}`}>{t('billing.secure.cta')}</Link>
      </Button>
      {!compact && <span className="text-caption text-ink-3">{t('billing.secure.ctaHint', { fee: formatMoney(d.quote.feeCents) })}</span>}
    </div>
  );
}

export default SecurePaymentCta;
