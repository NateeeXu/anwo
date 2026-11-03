// /post/listing and /listings/:id/edit — DESIGN.md §7.4 five-step wizard with localStorage draft autosave, geocode + draggable pin,
// campus auto-suggest, PhotoUploader, live card preview, publish → /listings/:id/success.
import { Check, LocateFixed, Trash2 } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Marker } from 'react-leaflet';
import type L from 'leaflet';
import { useNavigate, useParams } from 'react-router';
import { CAMPUSES } from '@shared/campuses';
import { Amenity, Furnished, GenderPref, LeaseType, ListingType, Parking, PropertyType } from '@shared/enums';
import type { Listing, ListingCard as ListingCardDto } from '@shared/types';
import type { ListingInput } from '@shared/schemas/listings';
import { Button, Checkbox, FilterChip, Input, PhotoUploader, SegmentedControl, Select, Switch, Textarea, type UploaderFile } from '@/components';
import { MapView, pricePinIcon } from '@/components/map';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/campus';
import { haversineM } from '@/lib/geo';
import { useIsMobile } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { storage } from '@/lib/storage';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { cn } from '@/lib/cn';
import { Head } from '@/app/Head';
import { errorMessage } from '@/app/errors';
import { RequireTrust } from '@/app/guards';
import { useShellOptions } from '@/app/shell/shellStore';
import { keys, listingsApi, type GeocodeResponse } from '../api';
import { datePresets } from '../filters';
import { ListingCard } from '../components/ListingCard';

const DRAFT_KEY = 'anwo.listings.draft';
const STEPS = 5;
const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

export type Draft = {
  step: number;
  title: string; description: string; listingType: ListingInput['listingType']; propertyType: ListingInput['propertyType'];
  line1: string; line2: string; city: string; state: string; zip: string;
  lat: number | null; lng: number | null; precision: 'rooftop' | 'street' | 'city' | 'manual'; approx: boolean; campusId: string;
  hideExactAddress: boolean; neighborhood: string;
  priceDollars: string; depositDollars: string; utilitiesIncluded: boolean; utilitiesEstDollars: string; utilitiesNote: string;
  bedrooms: string; bathrooms: string; sqft: string; furnished: ListingInput['furnished'];
  availableFrom: string | null; availableTo: string | null; openEnded: boolean; minTermMonths: string; flexibleDates: boolean; leaseType: ListingInput['leaseType'];
  roommatesCount: string; genderPref: ListingInput['genderPref']; petsAllowed: boolean; parking: ListingInput['parking']; smokingAllowed: boolean;
  amenities: string[];
  photos: UploaderFile[];
};

function emptyDraft(campusId: string | null, campusCity?: { city: string; state: string }): Draft {
  return {
    step: 1, title: '', description: '', listingType: 'sublet', propertyType: 'apartment',
    line1: '', line2: '', city: campusCity?.city ?? '', state: campusCity?.state ?? '', zip: '',
    lat: null, lng: null, precision: 'rooftop', approx: false, campusId: campusId ?? '', hideExactAddress: true, neighborhood: '',
    priceDollars: '', depositDollars: '', utilitiesIncluded: false, utilitiesEstDollars: '', utilitiesNote: '',
    bedrooms: '1', bathrooms: '1', sqft: '', furnished: 'none',
    availableFrom: null, availableTo: null, openEnded: false, minTermMonths: '1', flexibleDates: false, leaseType: 'sublease',
    roommatesCount: '0', genderPref: 'any', petsAllowed: false, parking: 'none', smokingAllowed: false,
    amenities: ['wifi', 'heating'], photos: [],
  };
}
function fromListing(l: Listing): Draft {
  return {
    ...emptyDraft(l.campusId), step: 1,
    title: l.title, description: l.description, listingType: l.listingType, propertyType: l.propertyType,
    line1: l.addressLine1 ?? '', line2: l.addressLine2 ?? '', city: l.city, state: l.state, zip: l.zip ?? '',
    lat: l.lat, lng: l.lng, precision: 'manual', approx: false, campusId: l.campusId, hideExactAddress: l.hideExactAddress, neighborhood: l.neighborhood ?? '',
    priceDollars: String(Math.round(l.priceCents / 100)), depositDollars: String(Math.round(l.depositCents / 100)), utilitiesIncluded: l.utilitiesIncluded,
    utilitiesEstDollars: l.utilitiesEstCents ? String(Math.round(l.utilitiesEstCents / 100)) : '', utilitiesNote: l.utilitiesNote ?? '',
    bedrooms: String(l.bedrooms), bathrooms: String(l.bathrooms), sqft: l.sqft ? String(l.sqft) : '', furnished: l.furnished,
    availableFrom: l.availableFrom, availableTo: l.availableTo, openEnded: !l.availableTo, minTermMonths: String(l.minTermMonths), flexibleDates: l.flexibleDates, leaseType: l.leaseType,
    roommatesCount: String(l.roommatesCount), genderPref: l.genderPref, petsAllowed: l.petsAllowed, parking: l.parking, smokingAllowed: l.smokingAllowed,
    amenities: l.amenities, photos: l.photos.map((p) => ({ id: p.id, url: p.url, uploadId: p.uploadId, name: p.caption ?? undefined })),
  };
}
const dollars = (s: string): number | null => { const n = Number(s.replace(/[^0-9.]/g, '')); return s.trim() === '' || !Number.isFinite(n) ? null : Math.round(n * 100); };

function toInput(d: Draft): ListingInput {
  const price = dollars(d.priceDollars) ?? 0;
  return {
    title: d.title.trim(), description: d.description, listingType: d.listingType, propertyType: d.propertyType, campusId: d.campusId || undefined,
    address: { line1: d.line1.trim(), line2: d.line2.trim() || undefined, city: d.city.trim(), state: d.state.trim().toUpperCase(), zip: /^\d{5}(-\d{4})?$/.test(d.zip.trim()) ? d.zip.trim() : undefined },
    lat: d.lat ?? undefined, lng: d.lng ?? undefined, geocodePrecision: d.lat !== null ? d.precision : undefined,
    hideExactAddress: d.hideExactAddress, neighborhood: d.neighborhood.trim() || undefined,
    priceCents: price, depositCents: dollars(d.depositDollars) ?? 0,
    utilitiesIncluded: d.utilitiesIncluded, utilitiesNote: d.utilitiesNote.trim() || undefined, utilitiesEstCents: d.utilitiesIncluded ? undefined : dollars(d.utilitiesEstDollars) ?? undefined,
    bedrooms: Number(d.bedrooms) || 0, bathrooms: Number(d.bathrooms) || 1, sqft: Number(d.sqft) > 0 ? Math.round(Number(d.sqft)) : undefined, furnished: d.furnished,
    availableFrom: d.availableFrom ?? '', availableTo: d.openEnded ? null : d.availableTo, minTermMonths: Number(d.minTermMonths) || 1, flexibleDates: d.flexibleDates, leaseType: d.leaseType,
    roommatesCount: Number(d.roommatesCount) || 0, genderPref: d.genderPref, petsAllowed: d.petsAllowed, parking: d.parking, smokingAllowed: d.smokingAllowed,
    amenities: d.amenities as ListingInput['amenities'],
    photos: d.photos.filter((p) => p.uploadId).map((p) => ({ uploadId: p.uploadId! })),
  };
}

type Errors = Partial<Record<string, string>>;
function validate(d: Draft, step: number, t: (k: string, v?: Record<string, string | number>) => string): Errors {
  const e: Errors = {};
  if (step === 1) {
    if (d.line1.trim().length < 3) e.line1 = t('listings.wizard.err.address');
    if (!d.city.trim()) e.city = t('listings.wizard.err.city');
    if (!/^[A-Za-z]{2}$/.test(d.state.trim())) e.state = t('listings.wizard.err.state');
    if (d.lat === null || d.lng === null) e.locate = t('listings.wizard.err.locate');
    if (!d.campusId) e.campusId = t('listings.wizard.err.campus');
  }
  if (step === 2) {
    if (d.title.trim().length < 4) e.title = t('listings.wizard.err.title');
    if (d.bedrooms === '' || Number(d.bedrooms) < 0) e.bedrooms = t('listings.wizard.err.bedrooms');
  }
  if (step === 3) {
    if (!dollars(d.priceDollars)) e.priceDollars = t('listings.wizard.err.price');
    if (!d.availableFrom) e.availableFrom = t('listings.wizard.err.from');
    if (!d.openEnded && d.availableTo && d.availableFrom && d.availableTo < d.availableFrom) e.availableTo = t('listings.wizard.err.to');
  }
  if (step === 5) {
    if (!d.photos.some((p) => p.uploadId)) e.photos = t('listings.wizard.err.photos');
    else if (d.photos.some((p) => p.progress !== undefined && !p.error)) e.photos = t('listings.wizard.err.uploading');
  }
  return e;
}

function DraggablePin({ lat, lng, label, onMove }: { lat: number; lng: number; label: string; onMove: (lat: number, lng: number) => void }) {
  const ref = useRef<L.Marker | null>(null);
  const icon = useMemo(() => pricePinIcon({ label, kind: 'listing', selected: true }), [label]);
  return (
    <Marker
      ref={ref}
      position={[lat, lng]}
      draggable
      icon={icon}
      zIndexOffset={1000}
      eventHandlers={{ dragend: () => { const p = ref.current?.getLatLng(); if (p) onMove(+p.lat.toFixed(6), +p.lng.toFixed(6)); } }}
    />
  );
}

function Wizard({ editing }: { editing?: Listing }) {
  const t = useT();
  const { formatDistance, formatMoney } = useLocale();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { campus } = useCampus();
  useShellOptions({ back: true, hideTabs: true });
  const initial = useMemo<Draft>(() => {
    if (editing) return fromListing(editing);
    const saved = storage.get<Draft | null>(DRAFT_KEY, null);
    return saved && typeof saved === 'object' && 'title' in saved ? { ...emptyDraft(campus?.id ?? null), ...saved, photos: (saved.photos ?? []).filter((p) => p.uploadId) } : emptyDraft(campus?.id ?? null, campus ? { city: campus.city, state: campus.state } : undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [d, setD] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [restored] = useState(() => !editing && !!storage.get<Draft | null>(DRAFT_KEY, null)?.title);
  const [geo, setGeo] = useState<GeocodeResponse | null>(null);
  const step = d.step;
  const set = useCallback((p: Partial<Draft>) => setD((prev) => ({ ...prev, ...p })), []);

  // autosave (new listings only)
  useEffect(() => {
    if (editing) return;
    const id = window.setTimeout(() => { storage.set(DRAFT_KEY, { ...d, photos: d.photos.filter((p) => p.uploadId).map(({ id, url, uploadId, name }) => ({ id, url, uploadId, name })) }); setSavedAt(Date.now()); }, 600);
    return () => window.clearTimeout(id);
  }, [d, editing]);

  const geocode = useMutation({
    mutationFn: () => listingsApi.geocode([d.line1, d.city, `${d.state} ${d.zip}`.trim()].filter(Boolean).join(', '), d.campusId || campus?.id),
    onSuccess: (g) => {
      setGeo(g);
      const suggested = d.campusId && !g.campusSuggestion.suggested ? d.campusId : g.campusSuggestion.suggested?.id ?? g.campusSuggestion.nearest[0]?.id ?? d.campusId;
      set({ lat: g.lat, lng: g.lng, precision: g.precision === 'none' ? 'city' : g.precision, approx: g.approx, campusId: suggested, zip: d.zip || g.zip || '', city: d.city || g.city || '', state: d.state || g.state || '' });
      setErrors((e) => ({ ...e, locate: undefined }));
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  const selectedCampus = CAMPUSES.find((c) => c.id === d.campusId) ?? null;
  const campusDistance = selectedCampus && d.lat !== null && d.lng !== null ? haversineM({ lat: d.lat, lng: d.lng }, { lat: selectedCampus.lat, lng: selectedCampus.lng }) : null;

  const goto = (n: number) => { set({ step: Math.min(STEPS, Math.max(1, n)) }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const next = () => {
    const e = validate(d, step, t);
    setErrors(e);
    if (Object.keys(e).length) return;
    goto(step + 1);
  };

  const submit = useMutation({
    mutationFn: async (mode: 'publish' | 'draft' | 'update') => {
      const input = toInput(d);
      if (mode === 'update' && editing) {
        await listingsApi.update(editing.id, input);
        return { id: editing.id, mode };
      }
      const created = await listingsApi.create(input);
      if (mode === 'publish') await listingsApi.publish(created.id);
      return { id: created.id, mode };
    },
    onSuccess: ({ id, mode }) => {
      if (mode === 'update') { toast.success(t('listings.wizard.toast.updated')); navigate(`/listings/${id}`); return; }
      storage.remove(DRAFT_KEY);
      if (mode === 'publish') { track('listing.publish', { entityType: 'listing', entityId: id }); toast.success(t('listings.wizard.toast.created')); navigate(`/listings/${id}/success`, { replace: true }); }
      else { toast.success(t('listings.wizard.toast.draft')); navigate('/listings/mine'); }
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'QUOTA_EXCEEDED') { toast.error(t('listings.mine.quotaFull', { limit: (e.data as { limit?: number })?.limit ?? '' })); storage.remove(DRAFT_KEY); navigate('/listings/mine'); return; }
      if (e instanceof ApiError && e.fields) {
        const mapped: Errors = {};
        for (const [k, v] of Object.entries(e.fields)) mapped[k.replace(/^address\./, '').replace('priceCents', 'priceDollars')] = v;
        setErrors(mapped);
      }
      toast.error(errorMessage(t, e));
    },
  });
  const finish = (mode: 'publish' | 'draft' | 'update') => {
    const all = [1, 2, 3, 5].reduce<Errors>((acc, s) => ({ ...acc, ...validate(d, s, t) }), {});
    if (mode === 'draft') { delete all.photos; }
    setErrors(all);
    if (Object.keys(all).length) {
      const firstStep = all.line1 || all.city || all.state || all.locate || all.campusId ? 1 : all.title || all.bedrooms ? 2 : all.priceDollars || all.availableFrom || all.availableTo ? 3 : 5;
      goto(firstStep);
      return;
    }
    submit.mutate(mode);
  };

  const presets = useMemo(() => datePresets().map((p) => ({ ...p, label: t(`listings.filter.preset${p.key[0]!.toUpperCase()}${p.key.slice(1)}`) })), [t]);
  const stepTitles = [t('listings.wizard.step1'), t('listings.wizard.step2'), t('listings.wizard.step3'), t('listings.wizard.step4'), t('listings.wizard.step5')];
  const errorList = Object.values(errors).filter(Boolean) as string[];

  const previewCard: ListingCardDto = {
    id: editing?.id ?? 'preview', title: d.title || t('listings.wizard.title.placeholder'), priceCents: dollars(d.priceDollars) ?? 0, depositCents: dollars(d.depositDollars) ?? 0,
    bedrooms: Number(d.bedrooms) || 0, bathrooms: Number(d.bathrooms) || 1, propertyType: d.propertyType, listingType: d.listingType, furnished: d.furnished,
    availableFrom: d.availableFrom ?? new Date().toISOString().slice(0, 10), availableTo: d.openEnded ? null : d.availableTo, city: d.city, state: d.state, neighborhood: d.neighborhood || null,
    lat: d.lat ?? 0, lng: d.lng ?? 0, coverUrl: d.photos[0]?.url ?? null, photoCount: d.photos.length, status: 'active', campusId: d.campusId,
    campus: selectedCampus ? { id: selectedCampus.id, shortName: selectedCampus.shortName, city: selectedCampus.city, state: selectedCampus.state } : { id: '', shortName: '', city: d.city, state: d.state },
    isVerifiedListing: (user?.trustLevel ?? 0) >= 2, nearShuttle: false, distanceToCampusM: campusDistance, commuteWalkMin: campusDistance !== null ? Math.ceil(campusDistance / 80) : null,
    commuteShuttleMin: null, saveCount: 0, viewCount: 0, ownerTrustLevel: user?.trustLevel ?? 0, publishedAt: null, sponsored: false,
  };

  const field = (k: string) => errors[k];

  return (
    <div className="mx-auto w-full max-w-form px-4 pb-28 lg:max-w-content lg:px-8 lg:pb-10">
      <Head title={editing ? t('listings.wizard.editTitle') : t('listings.wizard.title')} />
      <div className="flex flex-col gap-1 pt-2">
        <p className="text-caption text-ink-3">{t('listings.wizard.step', { n: step, total: STEPS })} · {stepTitles[step - 1]}</p>
        <div className="h-0.5 w-full overflow-hidden rounded-pill bg-line"><div className="h-full bg-accent transition-[width] duration-token-base" style={{ width: `${(step / STEPS) * 100}%` }} /></div>
        <h1 className="mt-2 text-h1-sm text-ink md:text-h1">{editing ? t('listings.wizard.editTitle') : t('listings.wizard.title')}</h1>
        <ol className="mt-1 hidden gap-3 text-small text-ink-3 md:flex" aria-label={t('listings.wizard.step', { n: step, total: STEPS })}>
          {stepTitles.map((s, i) => (
            <li key={s}><button type="button" className={cn('flex items-center gap-1 rounded-xs', i + 1 === step ? 'text-ink' : i + 1 < step ? 'text-accent-text hover:underline' : 'cursor-default')} onClick={() => { if (i + 1 < step) goto(i + 1); }} disabled={i + 1 > step}>{i + 1 < step && <Check className="size-3.5" aria-hidden />}{s}</button></li>
          ))}
        </ol>
      </div>

      {restored && step === 1 && !editing && (
        <p className="mt-3 flex items-center justify-between gap-2 rounded-card bg-sunken px-3 py-2 text-small text-ink-2">
          {t('listings.wizard.draftRestored')}
          <Button variant="ghost" size="sm" iconLeft={<Trash2 className="size-4" />} onClick={() => { storage.remove(DRAFT_KEY); setD(emptyDraft(campus?.id ?? null, campus ? { city: campus.city, state: campus.state } : undefined)); }}>{t('listings.wizard.discardDraft')}</Button>
        </p>
      )}

      {errorList.length > 0 && (
        <div role="alert" className="mt-3 rounded-card border border-danger/40 bg-danger-soft px-3 py-2 text-small text-danger">
          <p className="font-medium">{t('listings.wizard.errorsTitle', { n: errorList.length })}</p>
          <ul className="list-disc pl-5">{errorList.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <div className={cn('mt-5 grid gap-8', step === 5 && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
        <form className="flex max-w-form flex-col gap-5" onSubmit={(e) => { e.preventDefault(); if (step < STEPS) next(); else finish(editing ? 'update' : 'publish'); }} noValidate>
          {step === 1 && (
            <>
              <Input label={t('listings.wizard.address')} placeholder={t('listings.wizard.addressPlaceholder')} value={d.line1} onChange={(e) => set({ line1: e.target.value, lat: null, lng: null })} error={field('line1')} required autoComplete="street-address" />
              <Input label={t('listings.wizard.addressLine2')} value={d.line2} onChange={(e) => set({ line2: e.target.value })} optional autoComplete="address-line2" />
              <div className="grid grid-cols-[1fr_88px_120px] gap-3">
                <Input label={t('listings.wizard.city')} value={d.city} onChange={(e) => set({ city: e.target.value, lat: null, lng: null })} error={field('city')} required autoComplete="address-level2" />
                <Select label={t('listings.wizard.state')} value={d.state.toUpperCase() || null} onChange={(v) => set({ state: v, lat: null, lng: null })} options={US_STATES.map((s) => ({ value: s, label: s }))} searchable error={field('state')} required placeholder="IL" />
                <Input label={t('listings.wizard.zip')} value={d.zip} onChange={(e) => set({ zip: e.target.value })} optional inputMode="numeric" autoComplete="postal-code" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" iconLeft={<LocateFixed className="size-4" />} loading={geocode.isPending} onClick={() => geocode.mutate()} disabled={!d.line1 || !d.city || !d.state}>{geocode.isPending ? t('listings.wizard.locating') : t('listings.wizard.locate')}</Button>
                <span className={cn('text-small', field('locate') ? 'text-danger' : 'text-ink-3')}>{field('locate') ?? t('listings.wizard.locateHint')}</span>
              </div>
              {d.lat !== null && d.lng !== null && (
                <div className="flex flex-col gap-2">
                  <MapView center={[d.lat, d.lng]} zoom={16} height={240} className="overflow-hidden rounded-card border border-line" locate={false} markers={selectedCampus ? [{ id: 'campus', kind: 'campus', lat: selectedCampus.lat, lng: selectedCampus.lng, label: selectedCampus.shortName }] : []} clusterThreshold={Infinity}>
                    <DraggablePin lat={d.lat} lng={d.lng} label={dollars(d.priceDollars) ? formatMoney(dollars(d.priceDollars)!) : '📍'} onMove={(lat, lng) => set({ lat, lng, precision: 'manual', approx: false })} />
                  </MapView>
                  <p className="text-caption text-ink-3">{d.precision === 'manual' ? t('listings.wizard.pinMoved') : t('listings.wizard.dragPin')}</p>
                  {d.approx && <p className="rounded-ctl bg-warning-soft px-3 py-2 text-small text-warning">{t('listings.wizard.approxWarning')}</p>}
                </div>
              )}
              <Select
                label={t('listings.wizard.campus')}
                searchable
                value={d.campusId || null}
                onChange={(v) => set({ campusId: v })}
                options={CAMPUSES.map((c) => ({ value: c.id, label: `${c.shortName} · ${c.city}, ${c.state}`, text: `${c.shortName} ${c.name} ${c.nameZh ?? ''} ${c.city}` }))}
                hint={campusDistance !== null ? (campusDistance > 40_000 ? t('listings.wizard.campusFar') : geo?.campusSuggestion.suggested?.id === d.campusId ? t('listings.wizard.campusSuggested', { d: formatDistance(campusDistance) }) : formatDistance(campusDistance)) : undefined}
                error={field('campusId')}
                required
              />
              <Input label={t('listings.wizard.neighborhood')} placeholder={t('listings.wizard.neighborhoodPlaceholder')} value={d.neighborhood} onChange={(e) => set({ neighborhood: e.target.value })} optional />
              <Switch label={t('listings.wizard.hideAddress')} description={t('listings.wizard.hideAddressHint')} checked={d.hideExactAddress} onChange={(v) => set({ hideExactAddress: v })} />
            </>
          )}

          {step === 2 && (
            <>
              <Input label={t('listings.wizard.title.label')} placeholder={t('listings.wizard.title.placeholder')} hint={t('listings.wizard.title.hint')} value={d.title} onChange={(e) => set({ title: e.target.value })} error={field('title')} maxLength={120} required />
              <SegmentedControl label={t('listings.wizard.wholeOrRoom')} fullWidth value={d.propertyType === 'room' || d.propertyType === 'shared_room' ? 'room' : 'whole'} onChange={(v) => set({ propertyType: v === 'room' ? 'room' : 'apartment' })} options={[{ value: 'whole', label: t('listings.wizard.whole') }, { value: 'room', label: t('listings.wizard.roomOnly') }]} />
              <div className="grid grid-cols-2 gap-3">
                <Select label={t('listings.wizard.listingType')} value={d.listingType} onChange={(v) => set({ listingType: v as Draft['listingType'] })} options={ListingType.map((v) => ({ value: v, label: t(`listings.type.${v}`) }))} />
                <Select label={t('listings.wizard.propertyType')} value={d.propertyType} onChange={(v) => set({ propertyType: v as Draft['propertyType'] })} options={PropertyType.map((v) => ({ value: v, label: t(`listings.prop.${v}`) }))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Select label={t('listings.wizard.bedrooms')} value={d.bedrooms} onChange={(v) => set({ bedrooms: v })} options={['0', '1', '2', '3', '4', '5', '6'].map((n) => ({ value: n, label: n === '0' ? t('listings.card.studio') : n }))} error={field('bedrooms')} />
                <Select label={t('listings.wizard.bathrooms')} value={d.bathrooms} onChange={(v) => set({ bathrooms: v })} options={['1', '1.5', '2', '2.5', '3', '4'].map((n) => ({ value: n, label: n }))} />
                <Input label={t('listings.wizard.sqft')} value={d.sqft} onChange={(e) => set({ sqft: e.target.value })} inputMode="numeric" optional />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select label={t('listings.wizard.furnished')} value={d.furnished} onChange={(v) => set({ furnished: v as Draft['furnished'] })} options={Furnished.map((v) => ({ value: v, label: t(`listings.furnished.${v}`) }))} />
                <Select label={t('listings.wizard.leaseType')} value={d.leaseType} onChange={(v) => set({ leaseType: v as Draft['leaseType'] })} options={LeaseType.map((v) => ({ value: v, label: t(`listings.lease.${v}`) }))} />
              </div>
              <Switch label={t('listings.wizard.utilitiesIncluded')} checked={d.utilitiesIncluded} onChange={(v) => set({ utilitiesIncluded: v })} />
              {!d.utilitiesIncluded && (
                <div className="grid grid-cols-[140px_1fr] gap-3">
                  <Input label={t('listings.wizard.utilitiesEst')} prefix="$" suffix="/mo" inputMode="numeric" value={d.utilitiesEstDollars} onChange={(e) => set({ utilitiesEstDollars: e.target.value })} optional />
                  <Input label={t('listings.wizard.utilitiesNote')} value={d.utilitiesNote} onChange={(e) => set({ utilitiesNote: e.target.value })} maxLength={200} optional />
                </div>
              )}
              <fieldset className="flex flex-col gap-2">
                <legend className="text-small font-medium text-ink">{t('listings.wizard.amenities')}</legend>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                  {Amenity.map((a) => (
                    <Checkbox key={a} label={t(`listings.amenity.${a}`)} checked={d.amenities.includes(a)} onChange={(e) => set({ amenities: e.target.checked ? [...d.amenities, a] : d.amenities.filter((x) => x !== a) })} />
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {step === 3 && (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-small font-medium text-ink">{t('listings.wizard.dates')}</legend>
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => (
                    <FilterChip key={p.key} size="sm" selected={d.availableFrom === p.start && d.availableTo === p.end && !d.openEnded} onClick={() => set({ availableFrom: p.start, availableTo: p.end, openEnded: false })}>{p.label}</FilterChip>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="date" label={t('listings.wizard.dateFrom')} value={d.availableFrom ?? ''} onChange={(e) => set({ availableFrom: e.target.value || null })} error={field('availableFrom')} required />
                  <Input type="date" label={t('listings.wizard.dateTo')} value={d.openEnded ? '' : d.availableTo ?? ''} min={d.availableFrom ?? undefined} disabled={d.openEnded} onChange={(e) => set({ availableTo: e.target.value || null })} error={field('availableTo')} optional />
                </div>
                <p className="text-caption text-ink-3">{t('listings.wizard.datesHint')}</p>
              </fieldset>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Checkbox label={t('listings.wizard.openEnded')} checked={d.openEnded} onChange={(e) => set({ openEnded: e.target.checked, availableTo: e.target.checked ? null : d.availableTo })} />
                <Switch label={t('listings.wizard.flexible')} checked={d.flexibleDates} onChange={(v) => set({ flexibleDates: v })} size="sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label={t('listings.wizard.price')} prefix="$" suffix="/mo" inputMode="numeric" size="lg" value={d.priceDollars} onChange={(e) => set({ priceDollars: e.target.value })} error={field('priceDollars')} required />
                <Input label={t('listings.wizard.deposit')} prefix="$" inputMode="numeric" size="lg" hint={t('listings.wizard.depositHint')} value={d.depositDollars} onChange={(e) => set({ depositDollars: e.target.value })} />
              </div>
              <Select label={t('listings.wizard.minTerm')} value={d.minTermMonths} onChange={(v) => set({ minTermMonths: v })} options={['1', '2', '3', '4', '6', '9', '12'].map((n) => ({ value: n, label: t('listings.filter.months', { n }) }))} />
            </>
          )}

          {step === 4 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Select label={t('listings.wizard.roommates')} value={d.roommatesCount} onChange={(v) => set({ roommatesCount: v })} options={['0', '1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }))} />
                <Select label={t('listings.wizard.genderPref')} value={d.genderPref} onChange={(v) => set({ genderPref: v as Draft['genderPref'] })} options={GenderPref.map((g) => ({ value: g, label: t(`listings.detail.gender.${g}`) }))} />
              </div>
              <Select label={t('listings.wizard.parking')} value={d.parking} onChange={(v) => set({ parking: v as Draft['parking'] })} options={Parking.map((p) => ({ value: p, label: t(`listings.detail.parking.${p}`) }))} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Switch label={t('listings.wizard.pets')} checked={d.petsAllowed} onChange={(v) => set({ petsAllowed: v })} size="sm" />
                <Switch label={t('listings.wizard.smoking')} checked={d.smokingAllowed} onChange={(v) => set({ smokingAllowed: v })} size="sm" />
              </div>
              <Textarea label={t('listings.wizard.description')} placeholder={t('listings.wizard.descriptionPlaceholder')} hint={t('listings.wizard.descriptionHint')} rows={6} maxRows={14} maxLength={5000} showCount value={d.description} onChange={(e) => set({ description: e.target.value })} />
            </>
          )}

          {step === 5 && (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-small font-medium text-ink">{t('listings.wizard.photos')}</p>
                <PhotoUploader files={d.photos} onChange={(files) => set({ photos: files })} onReorder={(files) => set({ photos: files })} max={10} purpose="listing" label={t('listings.wizard.photosLabel')} />
                <p className={cn('text-caption', field('photos') ? 'text-danger' : 'text-ink-3')}>{field('photos') ?? t('listings.wizard.photosHint')}</p>
              </div>
              <div className="rounded-card border border-line p-4">
                <h2 className="text-h3 text-ink">{t('listings.wizard.review')}</h2>
                <p className="text-small text-ink-2">{t('listings.wizard.reviewHint')}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-small">
                  {[
                    [t('listings.wizard.address'), `${d.line1}${d.line2 ? ' ' + d.line2 : ''}, ${d.city}, ${d.state} ${d.zip}`.trim()],
                    [t('listings.wizard.campus'), selectedCampus?.shortName ?? '—'],
                    [t('listings.wizard.price'), dollars(d.priceDollars) ? `${formatMoney(dollars(d.priceDollars)!, { perMonth: true })}` : '—'],
                    [t('listings.wizard.dates'), `${d.availableFrom ?? '—'}${d.openEnded ? ' → ' + t('listings.card.openEnded') : d.availableTo ? ' → ' + d.availableTo : ''}`],
                    [t('listings.wizard.bedrooms'), `${d.bedrooms === '0' ? t('listings.card.studio') : d.bedrooms} · ${d.bathrooms}`],
                    [t('listings.wizard.furnished'), t(`listings.furnished.${d.furnished}`)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex flex-col"><dt className="text-caption text-ink-3">{k}</dt><dd className="text-ink">{v}</dd></div>
                  ))}
                </dl>
                <p className="mt-3 text-caption text-ink-3">{editing ? '' : t('listings.wizard.publishHint')} {!user?.isPro && t('listings.wizard.quotaHint', { limit: user?.listingQuota ?? 2 })}</p>
              </div>
              <div className="lg:hidden"><p className="mb-2 text-small font-medium text-ink">{t('listings.wizard.preview')}</p><ListingCard listing={previewCard} noSave /></div>
            </>
          )}

          <div className="fixed inset-x-0 bottom-14 z-layer-nav flex items-center gap-2 border-t border-line bg-surface/95 px-4 py-3 pb-safe lg:static lg:mt-2 lg:border-0 lg:bg-transparent lg:p-0">
            <span className="mr-auto text-caption text-ink-3" aria-live="polite">{!editing && savedAt ? `${t('listings.wizard.draftSaved')} ✓` : ''}</span>
            {step > 1 && <Button type="button" variant="ghost" onClick={() => goto(step - 1)}>{t('listings.wizard.prev')}</Button>}
            {step < STEPS ? (
              <Button type="submit">{t('listings.wizard.next')}</Button>
            ) : editing ? (
              <Button type="submit" loading={submit.isPending}>{t('listings.wizard.saveChanges')}</Button>
            ) : (
              <>
                <Button type="button" variant="secondary" loading={submit.isPending && submit.variables === 'draft'} onClick={() => finish('draft')}>{t('listings.wizard.saveDraft')}</Button>
                <Button type="submit" size="lg" loading={submit.isPending && submit.variables === 'publish'}>{submit.isPending && submit.variables === 'publish' ? t('listings.wizard.publishing') : t('listings.wizard.publish')}</Button>
              </>
            )}
          </div>
        </form>

        {step === 5 && (
          <aside className="hidden lg:block">
            <div className="sticky top-20 flex flex-col gap-2">
              <p className="text-small font-medium text-ink">{t('listings.wizard.preview')}</p>
              <ListingCard listing={previewCard} noSave />
              <p className="text-caption text-ink-3">{t('listings.wizard.previewHint')}</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function PostWizard() {
  return (
    <RequireTrust level={1} reason="post">
      <Wizard />
    </RequireTrust>
  );
}

export function EditListing() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: keys.detail(id), queryFn: () => listingsApi.detail(id), enabled: !!id });
  const t = useT();
  if (q.isLoading) return <div className="mx-auto w-full max-w-form px-4 py-8 text-small text-ink-3">{t('common.loading')}</div>;
  if (!q.data) return <div className="mx-auto w-full max-w-form px-4 py-8 text-small text-ink-3">{t('listings.detail.notFound')}</div>;
  return (
    <RequireTrust level={0}>
      <Wizard editing={q.data} key={q.data.id} />
    </RequireTrust>
  );
}
