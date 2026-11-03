// /market/bundles/new and /market/bundles/:id/edit — create a move-out bundle from the seller's active items,
// optionally linked to one of their sublet listings (prefilled from ?listingId= when the listing page links here).
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { BundleInput } from '@shared/schemas/market';
import type { ListingCard, Paginated } from '@shared/types';
import { Button, Checkbox, EmptyState, Input, Select, Skeleton, Textarea } from '@/components';
import { Head } from '@/app/Head';
import { RequireTrust } from '@/app/guards';
import { errorMessage, fieldError } from '@/app/errors';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/campus';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { useBundle, useCreateBundle, useMyItems, useUpdateBundle } from '../api';
import { CategoryIcon } from '../components/shared';

function Form({ bundleId }: { bundleId?: string }) {
  const t = useT();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { user } = useAuth();
  const { campusId } = useCampus();
  const { formatMoney, formatPrice } = useLocale();
  const existing = useBundle(bundleId);
  const myItems = useMyItems('all');
  const create = useCreateBundle();
  const update = useUpdateBundle();
  const listings = useQuery({
    queryKey: ['listings', 'mine-for-bundle', user?.id],
    queryFn: () => api<Paginated<ListingCard>>('/api/listings', { query: { ownerId: user?.id, pageSize: 50 } }),
    enabled: !!user,
    retry: false,
  });
  const listingOptions = Array.isArray(listings.data?.items) ? listings.data!.items : [];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discount, setDiscount] = useState('10');
  const [moveOut, setMoveOut] = useState('');
  const [listingId, setListingId] = useState<string>(sp.get('listingId') ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  useEffect(() => {
    const b = existing.data;
    if (!b) return;
    setTitle(b.title); setDescription(b.description ?? ''); setDiscount(String(b.discountPct)); setMoveOut(b.moveOutDate ?? ''); setListingId(b.listingId ?? '');
    setSelected(new Set((b.items ?? []).map((i) => i.id)));
  }, [existing.data]);

  const candidates = useMemo(() => (myItems.data?.items ?? []).filter((i) => (i.status === 'active' || i.status === 'reserved') && (!i.bundleId || i.bundleId === bundleId)), [myItems.data, bundleId]);
  const totals = useMemo(() => {
    const total = candidates.filter((i) => selected.has(i.id)).reduce((s, i) => s + (i.isFree ? 0 : i.priceCents), 0);
    const pct = Math.min(100, Math.max(0, Number(discount) || 0));
    return { total, bundle: Math.round((total * (100 - pct)) / 100) };
  }, [candidates, selected, discount]);

  const submit = () => {
    const e: Record<string, string> = {};
    if (title.trim().length < 2) e.title = t('market.bundle.form.error.title');
    setErrors(e);
    if (Object.keys(e).length) return;
    const body: BundleInput = {
      title: title.trim(), description: description.trim() || null, discountPct: Math.min(100, Math.max(0, Math.round(Number(discount) || 0))), moveOutDate: moveOut || null,
      listingId: listingId || null, itemIds: [...selected], campusId: campusId ?? undefined,
    };
    const onError = (err: unknown) => { setServerError(err); toast.error(errorMessage(t, err)); };
    if (bundleId) update.mutate({ id: bundleId, body }, { onSuccess: (b) => { toast.success(t('market.bundle.form.saved')); navigate(`/market/bundles/${b.id}`); }, onError });
    else create.mutate(body, { onSuccess: (b) => { toast.success(t('market.bundle.form.created')); navigate(`/market/bundles/${b.id}`); }, onError });
  };

  if (bundleId && existing.isPending) return <div className="mx-auto w-full max-w-form px-4" aria-busy="true"><Skeleton variant="rect" height={320} /></div>;
  if (bundleId && (existing.isError || (existing.data && user && existing.data.sellerId !== user.id && user.role !== 'admin'))) {
    return <div className="mx-auto w-full max-w-form px-4"><EmptyState icon={CircleAlert} title={t('market.bundle.notFound')} /></div>;
  }

  return (
    <div className="mx-auto w-full max-w-form px-4 lg:px-8">
      <Head title={bundleId ? t('market.bundle.form.editTitle') : t('market.bundle.form.newTitle')} />
      <h1 className="text-h1 text-ink">{bundleId ? t('market.bundle.form.editTitle') : t('market.bundle.form.newTitle')}</h1>
      <p className="mt-1 text-small text-ink-2">{t('market.mine.bundlesHint')}</p>
      <form className="mt-6 flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <Input label={t('market.bundle.form.title')} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('market.bundle.form.titlePlaceholder')} error={errors.title ?? fieldError(t, serverError, 'title')} maxLength={120} required />
        <Textarea label={t('market.bundle.form.description')} rows={4} maxLength={2000} showCount value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('market.bundle.form.descriptionPlaceholder')} optional />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('market.bundle.form.discount')} suffix="%" type="number" inputMode="numeric" min={0} max={100} value={discount} onChange={(e) => setDiscount(e.target.value)} hint={t('market.bundle.form.discountHint')} />
          <Input label={t('market.bundle.form.moveOut')} type="date" value={moveOut} onChange={(e) => setMoveOut(e.target.value)} optional />
        </div>
        <Select
          label={t('market.bundle.form.listing')}
          value={listingId}
          onChange={(v) => setListingId(v)}
          hint={listings.isError ? t('market.bundle.form.listingUnavailable') : !listings.isPending && listingOptions.length === 0 ? t('market.bundle.form.listingNoneYet') : t('market.bundle.listingHint')}
          options={[{ value: '', label: t('market.bundle.form.listingNone') }, ...listingOptions.map((l) => ({ value: l.id, label: l.title, description: `${formatMoney(l.priceCents, { perMonth: true })} · ${l.neighborhood ?? l.city}` })), ...(listingId && !listingOptions.some((l) => l.id === listingId) ? [{ value: listingId, label: listingId }] : [])]}
        />

        <section>
          <p className="text-caption text-ink-2">{t('market.bundle.form.items')}</p>
          <p className="text-small text-ink-3">{t('market.bundle.form.itemsHint')}</p>
          {myItems.isPending ? (
            <div aria-busy="true" className="mt-2 flex flex-col gap-2"><Skeleton variant="row" /><Skeleton variant="row" /></div>
          ) : candidates.length === 0 ? (
            <p className="mt-2 rounded-card bg-sunken px-3 py-3 text-small text-ink-2">{t('market.bundle.form.noItems')}</p>
          ) : (
            <ul className="mt-2 flex max-h-[420px] flex-col gap-1 overflow-y-auto rounded-card border border-line p-1">
              {candidates.map((it) => (
                <li key={it.id}>
                  <label className={cn('flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 hover:bg-sunken', selected.has(it.id) && 'bg-sunken')}>
                    <Checkbox checked={selected.has(it.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(it.id); else n.delete(it.id); return n; })} aria-label={it.title} />
                    <span className="relative size-10 shrink-0 overflow-hidden rounded-sm bg-sunken">
                      {it.coverUrl ? <img src={it.coverUrl} alt="" className="size-full object-cover" /> : <CategoryIcon category={it.category} className="absolute inset-0 m-auto size-5 text-ink-4" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-body text-ink">{it.title}</span>
                    <span className="text-small text-ink-2 tnum">{formatPrice(it)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {selected.size > 0 && <p className="mt-2 text-small text-ink-2" aria-live="polite">{t('market.bundle.form.selected', { n: selected.size, total: formatMoney(totals.total), bundle: formatMoney(totals.bundle) })}</p>}
        </section>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
          <Button type="submit" size="lg" loading={create.isPending || update.isPending}>{bundleId ? t('market.bundle.form.save') : t('market.bundle.form.submit')}</Button>
        </div>
      </form>
    </div>
  );
}

export default function BundleForm() {
  const { id } = useParams<{ id?: string }>();
  return (
    <RequireTrust level={1} reason="post">
      <Form bundleId={id} />
    </RequireTrust>
  );
}
