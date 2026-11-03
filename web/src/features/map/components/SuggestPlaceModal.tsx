// 「补充地点」: a student suggests a missing campus place (POST /api/map/suggestions). Admins review it; the
// suggester gets a bell notification when it goes live or is declined. Second tab lists "my suggestions".
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, MapPin, ShieldCheck, X } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { PoiCategory } from '@shared/enums';
import type { PoiSuggestion, PoiSuggestionInput } from '@shared/schemas/map';
import { Badge, Button, EmptyState, Input, Modal, Select, Skeleton, Tabs, Textarea } from '@/components';
import { MapView, type MapMarker } from '@/components/map';
import { errorMessage, fieldError } from '@/app/errors';
import { loginPath } from '@/app/guards';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/campus';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { keys, mapApi } from '../api';
import { poiCategoryKey } from '../labels';

export type SuggestPlaceModalProps = {
  open: boolean;
  onClose: () => void;
  /** where the pin starts (map centre, a search result, my location) */
  initialPoint: { lat: number; lng: number } | null;
  initialTab?: 'new' | 'mine';
  /** prefill from a geocoded address */
  initialAddress?: string | null;
};

type Form = { name: string; nameZh: string; category: PoiCategory | ''; address: string; url: string; note: string };
const EMPTY: Form = { name: '', nameZh: '', category: '', address: '', url: '', note: '' };

export function SuggestPlaceModal({ open, onClose, initialPoint, initialTab = 'new', initialAddress }: SuggestPlaceModalProps) {
  const t = useT();
  const { isZh, formatRelative } = useLocale();
  const { user, status } = useAuth();
  const { campus } = useCampus();
  const location = useLocation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'new' | 'mine'>(initialTab);
  const [form, setForm] = useState<Form>(EMPTY);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(initialPoint);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setForm({ ...EMPTY, address: initialAddress ?? '' });
    setPoint(initialPoint);
    setTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mine = useQuery({ queryKey: keys.mySuggestions, queryFn: mapApi.mySuggestions, enabled: open && status === 'authed' });

  const submit = useMutation({
    mutationFn: (body: PoiSuggestionInput) => mapApi.suggest(body),
    onSuccess: () => {
      toast.success(t('map.suggest.sent'), t('map.suggest.sentHint'));
      qc.invalidateQueries({ queryKey: keys.mySuggestions });
      setForm(EMPTY);
      setTouched(false);
      setTab('mine');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'CONFLICT') toast.error(t('map.suggest.duplicate'));
      else toast.error(errorMessage(t, e));
    },
  });

  const errors = useMemo(() => {
    const out: Partial<Record<keyof Form | 'point', string>> = {};
    if (form.name.trim().length < 2) out.name = t('map.suggest.err.name');
    if (!form.category) out.category = t('map.suggest.err.category');
    if (!point) out.point = t('map.suggest.err.point');
    if (form.url && !/^https?:\/\/\S+\.\S+/.test(form.url.trim())) out.url = t('map.suggest.err.url');
    return out;
  }, [form, point, t]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!campus || Object.keys(errors).length) return;
    submit.mutate({
      campusId: campus.id, name: form.name.trim(), nameZh: form.nameZh.trim() || null, category: form.category as PoiCategory,
      lat: +point!.lat.toFixed(6), lng: +point!.lng.toFixed(6), address: form.address.trim() || null, url: form.url.trim() || null, note: form.note.trim() || null,
    });
  };

  const markers: MapMarker[] = point ? [{ id: 'suggest', kind: 'poi', lat: point.lat, lng: point.lng, label: form.nameZh || form.name || t('map.suggest.pin'), selected: true }] : [];
  const showErr = (k: keyof typeof errors) => (touched ? errors[k] : undefined) ?? fieldError(t, submit.error, k);

  let body: React.ReactNode;
  if (status === 'anon') {
    body = (
      <EmptyState size="sm" icon={MapPin} title={t('map.suggest.loginTitle')} description={t('map.suggest.loginHint')}
        action={<Button asChild><Link to={loginPath(location.pathname + location.search)}>{t('map.suggest.login')}</Link></Button>} />
    );
  } else if (user && user.trustLevel < 1) {
    body = (
      <EmptyState size="sm" icon={ShieldCheck} title={t('map.suggest.verifyTitle')} description={t('map.suggest.verifyHint')}
        action={<Button asChild><Link to={`/verify-email?reason=post&next=${encodeURIComponent(location.pathname + location.search)}`}>{t('map.suggest.verify')}</Link></Button>} />
    );
  } else if (!campus) {
    body = <EmptyState size="sm" icon={MapPin} title={t('map.noCampus.title')} description={t('map.noCampus.hint')} />;
  } else if (tab === 'mine') {
    body = mine.isLoading ? (
      <div className="flex flex-col gap-2" aria-busy="true"><Skeleton variant="row" /><Skeleton variant="row" /></div>
    ) : !mine.data?.length ? (
      <EmptyState size="sm" icon={MapPin} title={t('map.suggest.mineEmpty')} description={t('map.suggest.mineEmptyHint')} action={{ label: t('map.suggest.new'), onClick: () => setTab('new') }} />
    ) : (
      <ul className="flex flex-col divide-y divide-line" data-testid="my-suggestions">
        {mine.data.map((s: PoiSuggestion) => (
          <li key={s.id} className="flex items-start gap-3 py-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-pill bg-sunken text-ink-2">
              {s.status === 'approved' ? <Check className="size-4" aria-hidden /> : s.status === 'rejected' ? <X className="size-4" aria-hidden /> : <Clock className="size-4" aria-hidden />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="truncate text-small font-semibold text-ink">{isZh ? s.nameZh || s.name : s.name}</span>
                <Badge size="sm" variant={s.status === 'approved' ? 'success' : s.status === 'rejected' ? 'danger' : 'neutral'}>{t(`map.suggest.status.${s.status}`)}</Badge>
              </span>
              <span className="text-caption text-ink-2">{t(poiCategoryKey(s.category))} · {s.campus?.shortName} · {formatRelative(s.createdAt)}</span>
              {s.status === 'rejected' && s.reviewReason && <span className="text-caption text-ink-2">{t('map.suggest.reason', { reason: s.reviewReason })}</span>}
              {s.status === 'approved' && s.poiId && (
                <Link to={`/map?c=${s.lat.toFixed(5)},${s.lng.toFixed(5)}&z=17&layers=pois&sel=poi:${s.poiId}`} onClick={onClose} className="text-caption text-accent-text hover:underline">{t('map.suggest.viewOnMap')}</Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  } else {
    body = (
      <form id="suggest-place-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <p className="text-small text-ink-2">{t('map.suggest.intro', { campus: isZh ? campus.nameZh ?? campus.shortName : campus.shortName })}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={t('map.suggest.name')} value={form.name} onChange={(e) => set('name', e.target.value)} error={showErr('name')} maxLength={120} required placeholder="Clarke's Off Campus" />
          <Input label={t('map.suggest.nameZh')} value={form.nameZh} onChange={(e) => set('nameZh', e.target.value)} maxLength={120} optional placeholder={t('map.suggest.nameZhPh')} />
        </div>
        <Select
          label={t('map.suggest.category')}
          value={form.category || null}
          onChange={(v) => set('category', v as PoiCategory)}
          placeholder={t('map.suggest.categoryPh')}
          error={showErr('category')}
          options={PoiCategory.map((c) => ({ value: c, label: t(poiCategoryKey(c)) }))}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-caption text-ink-2">{t('map.suggest.location')}</span>
          <MapView
            center={point ? [point.lat, point.lng] : campus ? [campus.lat, campus.lng] : undefined}
            zoom={16}
            height={200}
            markers={markers}
            locate={false}
            onMapClick={(p) => setPoint(p)}
            className="overflow-hidden rounded-card border border-line"
            aria-label={t('map.suggest.location')}
          />
          <span className={showErr('point') ? 'text-small text-danger' : 'text-caption text-ink-3'}>{showErr('point') ?? t('map.suggest.locationHint')}</span>
        </div>
        <Input label={t('map.suggest.address')} value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={200} optional placeholder="720 Clark St, Evanston, IL" />
        <Input label={t('map.suggest.url')} value={form.url} onChange={(e) => set('url', e.target.value)} error={showErr('url')} type="url" maxLength={300} optional placeholder="https://" />
        <Textarea label={t('map.suggest.note')} value={form.note} onChange={(e) => set('note', e.target.value)} maxLength={500} showCount rows={2} optional placeholder={t('map.suggest.notePh')} />
      </form>
    );
  }

  const canShowTabs = status === 'authed' && (user?.trustLevel ?? 0) >= 1 && !!campus;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('map.suggest.title')}
      sheetSnap="full"
      footer={
        canShowTabs && tab === 'new' ? (
          <>
            <Button variant="ghost" onClick={onClose}>{t('map.suggest.cancel')}</Button>
            <Button type="submit" form="suggest-place-form" loading={submit.isPending}>{t('map.suggest.submit')}</Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4" data-testid="suggest-modal">
        {canShowTabs && (
          <Tabs
            items={[{ key: 'new', label: t('map.suggest.new') }, { key: 'mine', label: t('map.suggest.mine'), count: mine.data?.length }]}
            value={tab}
            onChange={setTab}
            label={t('map.suggest.title')}
          />
        )}
        {body}
      </div>
    </Modal>
  );
}

export default SuggestPlaceModal;
