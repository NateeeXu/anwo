// Owner rail on the detail page (DESIGN §7.3 「Owner view swaps the rail for an owner panel」).
import { ChartColumn, Pencil, Rocket, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Listing } from '@shared/types';
import { Badge, Button, Card, Switch } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { useListingActions } from './useListingActions';
import { StatusBadge } from './StatusBadge';
import { BoostSheet } from '@/features/billing/components/BoostSheet';

export function OwnerPanel({ listing: l, onStats }: { listing: Listing; onStats: () => void }) {
  const t = useT();
  const { formatDate, formatNumber } = useLocale();
  const actions = useListingActions();
  const live = l.status === 'active';
  const busy = actions.pending && actions.pendingId === l.id;
  const [boostOpen, setBoostOpen] = useState(false);
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-h3 text-ink">{t('listings.detail.owner.title')}</h2>
        <StatusBadge status={l.status} />
      </div>
      {(l.status === 'active' || l.status === 'paused') && (
        <Switch
          label={t('listings.detail.owner.online')}
          description={live ? (l.expiresAt ? t('listings.detail.owner.expires', { date: formatDate(l.expiresAt, 'short') }) : undefined) : t('listings.detail.owner.pausedHint')}
          checked={live}
          disabled={busy}
          onChange={(v) => actions.run(v ? 'resume' : 'pause', l)}
        />
      )}
      {l.status === 'draft' && <Button fullWidth size="lg" loading={busy} onClick={() => actions.run('publish', l)}>{t('listings.detail.owner.publish')}</Button>}
      {l.status === 'expired' && <Button fullWidth size="lg" loading={busy} onClick={() => actions.run('renew', l)}>{t('listings.detail.owner.renew')}</Button>}
      {l.status === 'rented' && <Button fullWidth size="lg" loading={busy} onClick={() => actions.run('publish', l)}>{t('listings.detail.owner.relist')}</Button>}
      <dl className="grid grid-cols-3 gap-2 rounded-card bg-sunken p-3 text-center">
        {([['views', l.viewCount], ['saves', l.saveCount], ['leads', l.leadCount ?? 0]] as const).map(([k, v]) => (
          <div key={k}><dt className="text-caption text-ink-3">{t(`listings.detail.owner.${k}`)}</dt><dd className="text-price tabular-nums text-ink">{formatNumber(v)}</dd></div>
        ))}
      </dl>
      {l.activeBoost ? (
        <p className="flex items-center gap-2 text-small text-ink-2"><Badge variant="boosted" size="sm" />{t('listings.detail.owner.boosted', { tier: t(`listings.boostTier.${l.activeBoost.tier}`), date: formatDate(l.activeBoost.endsAt, 'short') })}</p>
      ) : (
        live && <Button variant="secondary" iconLeft={<Rocket className="size-4" />} onClick={() => setBoostOpen(true)}>{t('listings.detail.owner.boost')}</Button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="secondary" size="sm" iconLeft={<Pencil className="size-4" />}><Link to={`/listings/${l.id}/edit`}>{t('listings.detail.owner.edit')}</Link></Button>
        <Button variant="secondary" size="sm" iconLeft={<ChartColumn className="size-4" />} onClick={onStats}>{t('listings.detail.owner.stats')}</Button>
        {(l.status === 'active' || l.status === 'paused') && <Button variant="ghost" size="sm" onClick={() => actions.askRented(l)}>{t('listings.detail.owner.markRented')}</Button>}
        <Button variant="ghost" size="sm" iconLeft={<Trash2 className="size-4" />} className="text-danger" onClick={() => actions.askDelete(l)}>{t('common.delete')}</Button>
      </div>
      <p className="text-caption text-ink-3">{t('listings.detail.owner.previewNote')}</p>
      {actions.dialogs}
      <BoostSheet open={boostOpen} onClose={() => setBoostOpen(false)} entityType="listing" entityId={l.id} surface="owner_panel" />
    </Card>
  );
}
