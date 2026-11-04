// /post/item (new) and /market/:id/edit — one form: photos, title, category, condition, price (免费 / OBO), retail price,
// brand, description, pickup landmark + map tap, handover, bundle. Live price suggestion from similar items.
import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, Lightbulb, MapPin } from 'lucide-react';
import { useMapEvents } from 'react-leaflet';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { DeliveryOption, ItemCondition, MarketCategory } from '@shared/enums';
import { MarketCategory as MARKET_CATEGORIES } from '@shared/enums';
import type { ItemInput, ItemPatch } from '@shared/schemas/market';
import type { Item } from '@shared/types';
import { Button, EmptyState, Input, PhotoUploader, SegmentedControl, Select, Skeleton, Switch, Textarea, type UploaderFile } from '@/components';
import { MapView, type MapMarker } from '@/components/map';
import { Head } from '@/app/Head';
import { RequireTrust } from '@/app/guards';
import { errorMessage, fieldError } from '@/app/errors';
import { useAuth } from '@/lib/auth';
import { useDebounce } from '@/lib/hooks';
import { useCampus } from '@/lib/campus';
import { campusCenter } from '@/lib/geo';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useBundles, useCreateItem, useItem, usePriceSuggestion, useUpdateItem } from '../api';
import { ItemCard } from '../components/ItemCard';
import { CATEGORY_ICON, CONDITIONS } from '../components/shared';

function ClickToSet({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

type FormState = {
  title: string; category: MarketCategory | null; condition: ItemCondition; price: string; isFree: boolean; obo: boolean; origPrice: string; brand: string;
  description: string; pickupLabel: string; pickupLat: number | null; pickupLng: number | null; delivery: DeliveryOption; bundleId: string | null; campusId: string | null;
};

function fromItem(it: Item): FormState {
  return {
    title: it.title, category: it.category, condition: it.condition, price: it.isFree ? '' : String(it.priceCents / 100), isFree: it.isFree, obo: it.obo,
    origPrice: it.originalPriceCents != null ? String(it.originalPriceCents / 100) : '', brand: it.brand ?? '', description: it.description, pickupLabel: it.pickupLabel ?? '',
    pickupLat: it.pickupLat, pickupLng: it.pickupLng, delivery: it.deliveryOption, bundleId: it.bundleId, campusId: it.campusId,
  };
}

function ItemForm({ existing }: { existing?: Item }) {
  const t = useT();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { user } = useAuth();
  const { campus, campusId, campuses } = useCampus();
  const { formatMoney } = useLocale();
  const create = useCreateItem();
  const update = useUpdateItem();
  const editing = !!existing;

  const [f, setF] = useState<FormState>(() =>
    existing ? fromItem(existing) : { title: '', category: (sp.get('category') as MarketCategory | null) || null, condition: 'good', price: '', isFree: false, obo: false, origPrice: '', brand: '', description: '', pickupLabel: '', pickupLat: null, pickupLng: null, delivery: 'pickup', bundleId: sp.get('bundleId'), campusId: campusId },
  );
  const [files, setFiles] = useState<UploaderFile[]>(() => (existing?.photos ?? []).map((p) => ({ id: p.id, url: p.url, uploadId: p.uploadId })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => { if (!f.campusId && campusId) set('campusId', campusId); }, [campusId, f.campusId]);

  const formCampus = campuses.find((c) => c.id === f.campusId) ?? campus;
  const debouncedTitle = useDebounce(f.title.trim(), 500);
  const suggestion = usePriceSuggestion(f.category, f.condition, f.campusId, !f.isFree && f.category !== 'free', debouncedTitle);
  const myBundles = useBundles({ sellerId: user?.id, status: 'active' }, !!user);

  const pin: MapMarker[] = f.pickupLat != null && f.pickupLng != null ? [{ id: 'pickup', lat: f.pickupLat, lng: f.pickupLng, kind: 'item', label: f.pickupLabel.slice(0, 16) || t('market.detail.pickup'), selected: true }] : [];
  const uploading = files.some((x) => x.progress !== undefined && !x.uploadId && !x.error);
  const isFree = f.isFree || f.category === 'free';

  const previewCard = useMemo(
    () =>
      user
        ? {
            id: existing?.id ?? 'preview', title: f.title || t('market.form.titlePlaceholder'), category: f.category ?? 'other', condition: f.condition, priceCents: isFree ? 0 : Math.round(Number(f.price || 0) * 100),
            isFree, obo: f.obo && !isFree, coverUrl: files[0]?.url ?? null, photoCount: files.length, status: 'active' as const, campusId: f.campusId ?? '', campus: { id: formCampus?.id ?? '', shortName: formCampus?.shortName ?? '', city: formCampus?.city ?? '', state: formCampus?.state ?? '' },
            pickupLabel: f.pickupLabel || null, pickupLat: f.pickupLat, pickupLng: f.pickupLng, distanceToCampusM: null, city: formCampus?.city ?? null, state: formCampus?.state ?? null, wishlistCount: 0, createdAt: new Date().toISOString(),
            seller: user, sponsored: false, bundleId: f.bundleId,
          }
        : null,
    [user, existing?.id, f, files, isFree, formCampus, t],
  );

  const validate = (draft: boolean): boolean => {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 2) e.title = t('market.form.error.title');
    if (!f.category) e.category = t('ui.required');
    if (!isFree && !(Number(f.price) > 0)) e.price = t('market.form.error.price');
    if (!draft && !isFree && files.filter((x) => x.uploadId).length === 0) e.photos = t('market.form.error.photos');
    if (uploading) e.photos = t('market.form.error.uploading');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = (draft: boolean) => {
    if (!validate(draft) || !f.category) return;
    setServerError(null);
    const base = {
      title: f.title.trim(), description: f.description.trim(), category: f.category, condition: f.condition, priceCents: isFree ? 0 : Math.round(Number(f.price) * 100), isFree, obo: f.obo && !isFree,
      originalPriceCents: f.origPrice ? Math.round(Number(f.origPrice) * 100) : null, brand: f.brand.trim() || null, pickupLabel: f.pickupLabel.trim() || null,
      pickupLat: f.pickupLat, pickupLng: f.pickupLng, deliveryOption: f.delivery, bundleId: f.bundleId, photos: files.filter((x) => x.uploadId).map((x) => ({ uploadId: x.uploadId! })),
    };
    const onError = (err: unknown) => { setServerError(err); toast.error(errorMessage(t, err)); };
    if (editing && existing) {
      const body: ItemPatch = base;
      update.mutate({ id: existing.id, body }, { onSuccess: (it) => { toast.success(t('market.form.saved')); navigate(`/market/${it.id}`); }, onError });
    } else {
      const body: ItemInput = { ...base, campusId: f.campusId ?? undefined, draft };
      create.mutate(body, {
        onSuccess: (it) => {
          track(draft ? 'item.draft' : 'item.publish', { entityType: 'market_item', entityId: it.id, props: { category: it.category } });
          // non-blocking boost upsell after publish (BUSINESS_PLAN §4.4)
          if (draft) toast.success(t('market.form.draftSaved'));
          else toast.success(t('market.form.published'), t('market.form.boostUpsell'), { label: t('market.form.boostUpsellCta'), onClick: () => navigate(`/pricing?boost=market_item:${it.id}&surface=publish_upsell`) }, 9000);
          navigate(draft ? '/market/mine' : `/market/${it.id}`);
        },
        onError,
      });
    }
  };
  const busy = create.isPending || update.isPending;
  const fe = (k: string) => errors[k] ?? fieldError(t, serverError, k);

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={editing ? t('market.form.editTitle') : t('market.form.newTitle')} />
      <h1 className="text-h1 text-ink">{editing ? t('market.form.editTitle') : t('market.form.newTitle')}</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-12">
        <form className="flex flex-col gap-6 lg:col-span-7" onSubmit={(e) => { e.preventDefault(); submit(false); }} noValidate>
          <section>
            <p className="text-caption text-ink-2">{t('market.form.photos')}</p>
            <p className="mb-2 text-small text-ink-3">{t('market.form.photosHint')}</p>
            <PhotoUploader files={files} onChange={setFiles} onReorder={setFiles} max={10} purpose="item" label={t('market.form.photos')} />
            {fe('photos') && <p className="mt-1 flex items-center gap-1 text-small text-danger"><CircleAlert className="size-3.5" aria-hidden />{fe('photos')}</p>}
          </section>

          <Input label={t('market.form.title')} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder={t('market.form.titlePlaceholder')} hint={t('market.form.titleHint')} error={fe('title')} maxLength={120} required />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select<MarketCategory>
              label={t('market.form.category')}
              value={f.category}
              onChange={(v) => set('category', v)}
              placeholder={t('ui.select')}
              error={fe('category')}
              options={MARKET_CATEGORIES.filter((c) => c !== 'move_out').map((c) => { const Icon = CATEGORY_ICON[c]; return { value: c, label: t(`market.cat.${c}`), icon: <Icon className="size-4" strokeWidth={1.75} aria-hidden /> }; })}
            />
            {!editing && (
              <Select label={t('market.form.campus')} value={f.campusId} onChange={(v) => set('campusId', v)} hint={t('market.form.campusHint')} searchable options={campuses.map((c) => ({ value: c.id, label: c.shortName, description: `${c.city}, ${c.state}`, text: `${c.name} ${c.nameZh ?? ''} ${c.city}` }))} />
            )}
          </div>

          <div>
            <p className="mb-2 text-caption text-ink-2">{t('market.form.condition')}</p>
            <div role="radiogroup" aria-label={t('market.form.condition')} className="flex flex-wrap gap-2">
              {CONDITIONS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={f.condition === c} onClick={() => set('condition', c)} title={t(`market.cond.hint.${c}`)} className={cn('h-9 rounded-pill border px-3 text-small font-medium transition-colors', f.condition === c ? 'border-inverse bg-inverse text-ink-inverse' : 'border-line-strong bg-surface text-ink hover:bg-sunken')}>
                  {t(`market.cond.${c}`)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-small text-ink-3">{t(`market.cond.hint.${f.condition}`)}</p>
          </div>

          <section className="rounded-card border border-line bg-surface p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={t('market.form.price')} prefix="$" type="number" inputMode="decimal" min={0} step="1" value={isFree ? '' : f.price} onChange={(e) => set('price', e.target.value)} disabled={isFree} error={fe('price') ?? fe('priceCents')} required={!isFree} />
              <Input label={t('market.form.origPrice')} prefix="$" type="number" inputMode="decimal" min={0} step="1" value={f.origPrice} onChange={(e) => set('origPrice', e.target.value)} optional disabled={isFree} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
              <Switch checked={isFree} onChange={(v) => { set('isFree', v); if (v) set('obo', false); }} label={t('market.form.free')} labelPosition="end" disabled={f.category === 'free'} />
              <Switch checked={f.obo && !isFree} onChange={(v) => set('obo', v)} label={t('market.form.obo')} labelPosition="end" disabled={isFree} />
            </div>
            {!isFree && f.category && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-sm bg-sunken px-3 py-2 text-small text-ink-2" aria-live="polite">
                <Lightbulb className="size-4 shrink-0 text-accent-text" aria-hidden />
                {suggestion.isPending ? (
                  <Skeleton variant="text" width={180} />
                ) : suggestion.data && suggestion.data.sampleSize > 0 ? (
                  <>
                    <span>
                      {t('market.form.suggestion')}：
                      {t('market.form.suggestionDetail', { price: formatMoney(suggestion.data.suggestedCents), low: formatMoney(suggestion.data.lowCents), high: formatMoney(suggestion.data.highCents), n: suggestion.data.sampleSize, basis: t(`market.detail.basis.${suggestion.data.basis}`) })}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => set('price', String(suggestion.data!.suggestedCents / 100))}>{t('market.form.useSuggestion')}</Button>
                  </>
                ) : (
                  <span>{t('market.form.suggestionNone')}</span>
                )}
              </div>
            )}
          </section>

          <Input label={t('market.form.brand')} value={f.brand} onChange={(e) => set('brand', e.target.value)} optional maxLength={60} />
          <Textarea label={t('market.form.description')} rows={5} maxLength={3000} showCount value={f.description} onChange={(e) => set('description', e.target.value)} placeholder={t('market.form.descriptionPlaceholder')} />

          <section>
            <p className="text-caption text-ink-2">{t('market.form.delivery')}</p>
            <SegmentedControl className="mt-2" value={f.delivery} onChange={(v) => set('delivery', v)} options={(['pickup', 'both', 'delivery'] as DeliveryOption[]).map((d) => ({ value: d, label: t(`market.form.delivery.${d}`) }))} label={t('market.form.delivery')} />
            <p className="mt-1 text-small text-ink-3">{t('market.form.deliveryHint')}</p>
          </section>

          {f.delivery !== 'delivery' && (
            <section>
              <Input label={t('market.form.pickupLabel')} value={f.pickupLabel} onChange={(e) => set('pickupLabel', e.target.value)} placeholder={t('market.form.pickupPlaceholder')} hint={t('market.form.pickupHint')} iconLeft={<MapPin className="size-4" aria-hidden />} maxLength={80} />
              <div className="mt-3 overflow-hidden rounded-card border border-line">
                <MapView center={pin.length ? [pin[0]!.lat, pin[0]!.lng] : campusCenter(formCampus)} zoom={14} height={240} markers={[...pin, ...(formCampus ? [{ id: 'campus', kind: 'campus' as const, lat: formCampus.lat, lng: formCampus.lng, label: formCampus.shortName }] : [])]} locate={false} aria-label={t('market.form.pickup')}>
                  <ClickToSet onPick={(lat, lng) => { set('pickupLat', lat); set('pickupLng', lng); }} />
                </MapView>
              </div>
              <p className="mt-1 text-caption text-ink-3">{pin.length ? t('market.form.pickupSet') : t('market.form.pickupMap')}</p>
            </section>
          )}

          {myBundles.data && myBundles.data.items.length > 0 && (
            <Select label={t('market.form.bundle')} hint={t('market.form.bundleHint')} value={f.bundleId ?? ''} onChange={(v) => set('bundleId', v || null)} options={[{ value: '', label: t('market.form.bundleNone') }, ...myBundles.data.items.map((b) => ({ value: b.id, label: b.title, description: t('market.bundle.items', { n: b.itemCount }) }))]} />
          )}

          {serverError && !Object.keys(errors).length ? <p className="flex items-center gap-2 text-small text-danger"><CircleAlert className="size-4" aria-hidden />{errorMessage(t, serverError)}</p> : null}

          <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-line bg-paper/95 px-4 py-3 pb-safe lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
            {!editing && <Button type="button" variant="secondary" onClick={() => submit(true)} loading={busy}>{t('market.form.saveDraft')}</Button>}
            <Button type="submit" loading={busy} size="lg">{editing ? t('market.form.save') : t('market.form.submit')}</Button>
          </div>
        </form>

        <aside className="hidden lg:col-span-5 lg:block">
          <div className="sticky top-20">
            <p className="mb-2 text-caption text-ink-2">{t('market.form.preview')}</p>
            {previewCard && <ItemCard item={previewCard} hideWishlist to="#" className="max-w-[300px] pointer-events-none" />}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function PostItem() {
  const t = useT();
  const { id } = useParams<{ id?: string }>();
  const { user } = useAuth();
  const item = useItem(id);
  return (
    <RequireTrust level={1} reason="post">
      {id ? (
        item.isPending ? (
          <div className="mx-auto w-full max-w-content px-4 lg:px-8" aria-busy="true"><Skeleton variant="text" width={240} height={28} /><div className="mt-6"><Skeleton variant="rect" height={320} /></div></div>
        ) : item.isError || !item.data || (user && item.data.seller.id !== user.id && user.role !== 'admin') ? (
          <div className="mx-auto w-full max-w-content px-4 lg:px-8"><EmptyState icon={CircleAlert} title={t('market.detail.notFound')} description={t('market.detail.notFoundHint')} /></div>
        ) : (
          <ItemForm existing={item.data} />
        )
      ) : (
        <ItemForm />
      )}
    </RequireTrust>
  );
}
