// Mark-sold modal: buyer picker (people from the seller's chats, item-specific first) + final price.
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { Item } from '@shared/types';
import { Avatar, Badge, Button, Input, Modal, Skeleton, TrustBadge } from '@/components';
import { errorMessage } from '@/app/errors';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { useBuyerCandidates, useMarkSold } from '../api';

export function MarkSoldModal({ item, open, onClose, onDone }: { item: Item; open: boolean; onClose: () => void; onDone?: (item: Item) => void }) {
  const t = useT();
  const candidates = useBuyerCandidates(open ? item.id : undefined);
  const markSold = useMarkSold();
  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  useEffect(() => {
    if (open) { setBuyerId(null); setPrice(item.isFree ? '0' : String(item.priceCents / 100)); }
  }, [open, item.id, item.isFree, item.priceCents]);

  const confirm = () => {
    const soldPriceCents = price === '' ? undefined : Math.max(0, Math.round(Number(price) * 100));
    markSold.mutate(
      { id: item.id, body: { buyerId, soldPriceCents: Number.isFinite(soldPriceCents) ? soldPriceCents : undefined } },
      { onSuccess: (updated) => { toast.success(t('market.sold.done')); onDone?.(updated); onClose(); }, onError: (e) => toast.error(errorMessage(t, e)) },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('market.sold.title')}
      description={t('market.sold.description')}
      size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={confirm} loading={markSold.isPending}>{t('market.sold.confirm')}</Button></>}
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-caption text-ink-2">{t('market.sold.buyer')}</p>
          <p className="text-small text-ink-3">{t('market.sold.buyerHint')}</p>
          <div role="radiogroup" aria-label={t('market.sold.buyer')} className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
            <button type="button" role="radio" aria-checked={buyerId === null} onClick={() => setBuyerId(null)} className={cn('flex h-11 items-center gap-3 rounded-sm px-2 text-left text-body text-ink-2 hover:bg-sunken', buyerId === null && 'bg-sunken text-ink')}>
              <span className="flex size-8 items-center justify-center rounded-pill border border-dashed border-line-strong" aria-hidden />
              <span className="flex-1">{t('market.sold.noBuyer')}</span>
              {buyerId === null && <Check className="size-4 text-accent-text" aria-hidden />}
            </button>
            {candidates.isPending && <Skeleton variant="row" />}
            {candidates.data?.length === 0 && <p className="px-2 py-2 text-small text-ink-3">{t('market.sold.noCandidates')}</p>}
            {candidates.data?.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={buyerId === c.id} onClick={() => setBuyerId(c.id)} className={cn('flex min-h-11 items-center gap-3 rounded-sm px-2 py-1 text-left hover:bg-sunken', buyerId === c.id && 'bg-sunken')}>
                <Avatar src={c.avatarUrl} name={c.name} size="sm" trustLevel={c.trustLevel} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-body text-ink"><span className="truncate">{c.name}</span><TrustBadge level={c.trustLevel} size="inline" /></span>
                  {c.aboutThisItem && <Badge variant="accent" size="sm">{t('market.sold.aboutThis')}</Badge>}
                </span>
                {buyerId === c.id && <Check className="size-4 text-accent-text" aria-hidden />}
              </button>
            ))}
          </div>
        </div>
        <Input label={t('market.sold.price')} hint={t('market.sold.priceHint')} prefix="$" type="number" inputMode="decimal" min={0} step="1" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
    </Modal>
  );
}

export default MarkSoldModal;
