// Owner actions (publish / pause / resume / rented / renew / delete) shared by the detail owner panel and /listings/mine.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Listing } from '@shared/types';
import { Button, Checkbox, Modal } from '@/components';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { errorMessage, type Translate } from '@/app/errors';
import { listingsApi } from '../api';

type Action = 'publish' | 'pause' | 'resume' | 'rented' | 'renew' | 'remove';

export function useListingActions() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [rentedFor, setRentedFor] = useState<Listing | null>(null);
  const [closeBundle, setCloseBundle] = useState(true);
  const [deleteFor, setDeleteFor] = useState<Listing | null>(null);

  const m = useMutation({
    mutationFn: ({ action, id, closeBundle }: { action: Action; id: string; closeBundle?: boolean }) => {
      switch (action) {
        case 'publish': return listingsApi.publish(id);
        case 'pause': return listingsApi.pause(id);
        case 'resume': return listingsApi.resume(id);
        case 'rented': return listingsApi.rented(id, closeBundle);
        case 'renew': return listingsApi.renew(id);
        case 'remove': return listingsApi.remove(id);
      }
    },
    onSuccess: (data, { action, id }) => {
      const key: Record<Action, string> = { publish: 'published', pause: 'paused', resume: 'resumed', rented: 'rented', renew: 'renewed', remove: 'deleted' };
      toast.success(t(`listings.mine.toast.${key[action]}`));
      if (action === 'publish') track('listing.publish', { entityType: 'listing', entityId: id });
      void qc.invalidateQueries({ queryKey: ['listings'] });
      if (data) qc.setQueryData(['listings', 'detail', id], data);
      if (action === 'remove') navigate('/listings/mine');
    },
    onError: (e, { action }) => {
      const msg = errorMessage(t as Translate, e);
      toast.error(msg, action === 'publish' ? t('listings.wizard.err.photos') : undefined);
    },
  });

  const run = (action: Exclude<Action, 'rented' | 'remove'>, l: Listing) => m.mutate({ action, id: l.id });
  const askRented = (l: Listing) => { setCloseBundle(!!l.bundle); setRentedFor(l); };
  const askDelete = (l: Listing) => setDeleteFor(l);

  const dialogs = (
    <>
      <Modal
        open={!!rentedFor}
        onClose={() => setRentedFor(null)}
        title={t('listings.mine.rentedTitle')}
        description={t('listings.mine.rentedBody')}
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setRentedFor(null)}>{t('common.cancel')}</Button><Button loading={m.isPending} onClick={() => { if (rentedFor) m.mutate({ action: 'rented', id: rentedFor.id, closeBundle }, { onSettled: () => setRentedFor(null) }); }}>{t('listings.mine.action.rented')}</Button></>}
      >
        {rentedFor?.bundle && <Checkbox label={t('listings.mine.rentedBundle')} description={rentedFor.bundle.title} checked={closeBundle} onChange={(e) => setCloseBundle(e.target.checked)} />}
      </Modal>
      <Modal
        open={!!deleteFor}
        onClose={() => setDeleteFor(null)}
        title={t('listings.detail.owner.delete')}
        description={t('listings.detail.owner.deleteConfirm')}
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setDeleteFor(null)}>{t('common.cancel')}</Button><Button variant="danger" loading={m.isPending} onClick={() => { if (deleteFor) m.mutate({ action: 'remove', id: deleteFor.id }, { onSettled: () => setDeleteFor(null) }); }}>{t('common.delete')}</Button></>}
      >
        <p className="text-body text-ink">{deleteFor?.title}</p>
      </Modal>
    </>
  );

  return { run, askRented, askDelete, pending: m.isPending, pendingId: m.variables?.id ?? null, dialogs };
}
