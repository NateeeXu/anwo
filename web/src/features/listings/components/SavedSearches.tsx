// Saved searches for the browse page: 「保存搜索」 modal + a dropdown of saved ones (stored by the scaffold /api/search/saved).
import { Bookmark, BookmarkCheck, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { SavedSearch } from '@shared/types';
import { Button, DropdownMenu, Input, Modal, Switch } from '@/components';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/campus';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { errorMessage } from '@/app/errors';
import { keys, listingsApi } from '../api';
import { EMPTY, toQuery, type Filters } from '../filters';

export function SavedSearches({ filters, onApply, pristine }: { filters: Filters; onApply: (f: Filters) => void; pristine: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const { status } = useAuth();
  const { campusId, scope } = useCampus();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [notify, setNotify] = useState(true);
  const authed = status === 'authed';
  const list = useQuery({ queryKey: keys.savedSearches, queryFn: listingsApi.savedSearches, enabled: authed });
  const save = useMutation({
    mutationFn: () => listingsApi.saveSearch({ campusId: scope === 'campus' ? campusId ?? undefined : undefined, scope, name: name.trim() || undefined, query: toQuery(filters), notify }),
    onSuccess: () => {
      toast.success(t('listings.browse.savedSearch.toast'));
      setOpen(false);
      setName('');
      void qc.invalidateQueries({ queryKey: keys.savedSearches });
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => listingsApi.deleteSavedSearch(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.savedSearches }),
  });

  const apply = (s: SavedSearch) => {
    const q = s.query as Record<string, unknown>;
    const csv = (v: unknown) => (typeof v === 'string' ? v.split(',').filter(Boolean) : []);
    onApply({
      ...EMPTY,
      q: typeof q.q === 'string' ? q.q : '',
      priceMin: typeof q.priceMin === 'number' ? q.priceMin : null,
      priceMax: typeof q.priceMax === 'number' ? q.priceMax : null,
      bedrooms: csv(q.bedrooms), propertyType: csv(q.propertyType), listingType: csv(q.listingType), furnished: csv(q.furnished), amenities: csv(q.amenities),
      bathroomsMin: typeof q.bathroomsMin === 'number' ? q.bathroomsMin : null,
      availableFrom: typeof q.availableFrom === 'string' ? q.availableFrom : null,
      availableTo: typeof q.availableTo === 'string' ? q.availableTo : null,
      minTermMax: typeof q.minTermMax === 'number' ? q.minTermMax : null,
      genderPref: (q.genderPref as Filters['genderPref']) ?? null,
      petsAllowed: q.petsAllowed === 1, parking: q.parking === 1, utilitiesIncluded: q.utilitiesIncluded === 1, verifiedOnly: q.verifiedOnly === 1, nearShuttle: q.nearShuttle === 1,
      sort: (q.sort as Filters['sort']) ?? 'recent',
      city: typeof q.city === 'string' ? q.city : null, state: typeof q.state === 'string' ? q.state : null,
      radiusKm: typeof q.radiusKm === 'number' ? q.radiusKm : null,
    });
  };

  const saved = list.data ?? [];
  const label = (s: SavedSearch) => s.name || Object.entries(s.query).filter(([k]) => k !== 'sort').map(([k, v]) => `${k}=${String(v)}`).join(' · ') || t('listings.title');

  return (
    <>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" iconLeft={<Bookmark className="size-4" />} disabled={pristine} onClick={() => (authed ? setOpen(true) : toast.info(t('listings.browse.savedSearch.loginHint')))}>
          {t('listings.browse.savedSearch.save')}
        </Button>
        {authed && saved.length > 0 && (
          <DropdownMenu
            label={t('listings.browse.savedSearch.title')}
            align="end"
            trigger={<Button variant="ghost" size="sm" iconOnly aria-label={t('listings.browse.savedSearch.title')}><BookmarkCheck className="size-4" /></Button>}
            items={saved.flatMap((s) => [
              { key: s.id, label: label(s), onSelect: () => apply(s) },
              { key: s.id + ':del', label: `${t('listings.browse.savedSearch.delete')} · ${label(s).slice(0, 24)}`, icon: <Trash2 className="size-4" />, danger: true, onSelect: () => del.mutate(s.id) },
            ])}
          />
        )}
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('listings.browse.savedSearch.save')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label={t('listings.browse.savedSearch.name')} placeholder={t('listings.browse.savedSearch.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <Switch label={t('listings.browse.savedSearch.notify')} checked={notify} onChange={setNotify} />
        </div>
      </Modal>
    </>
  );
}
