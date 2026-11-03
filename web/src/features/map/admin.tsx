// Admin panel for "map" — mounted by the admin shell at /admin/map (and standalone at /map/admin).
// Tabs: student place suggestions (approve → POI, reject with reason; the suggester is notified) · campus POIs
// (create / edit / hide / delete with a click-to-place map) · caches (geocode + commute stats, clear).
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Database, Eye, EyeOff, Inbox, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { PoiCategory } from '@shared/enums';
import type { PoiInput, PoiSuggestion, PoiSuggestionStatus } from '@shared/schemas/map';
import { Badge, Button, EmptyState, Input, Modal, PageHeader, Select, StatTile, Switch, Table, Tabs, Textarea, type Column } from '@/components';
import { MapView, type MapMarker } from '@/components/map';
import { Head } from '@/app/Head';
import { errorMessage, fieldError } from '@/app/errors';
import { useCampus } from '@/lib/campus';
import { useDebounce } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { keys, mapApi, type AdminPoi } from './api';
import { poiCategoryKey } from './labels';

type AdminTab = 'suggestions' | 'pois' | 'cache';

export default function MapAdminPanel() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tab = (['suggestions', 'pois', 'cache'].includes(params.get('tab') ?? '') ? params.get('tab') : 'suggestions') as AdminTab;
  const setTab = (k: AdminTab) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', k); return n; }, { replace: true });
  const stats = useQuery({ queryKey: keys.adminStats, queryFn: mapApi.admin.stats });
  const pending = stats.data?.suggestions?.pending;

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8" data-testid="map-admin">
      <Head title={t('map.admin.title')} />
      <PageHeader
        title={t('map.admin.title')}
        subtitle={t('map.admin.subtitle')}
        tabs={
          <Tabs
            label={t('map.admin.title')}
            value={tab}
            onChange={setTab}
            items={[
              { key: 'suggestions', label: t('map.admin.suggestions'), icon: <Inbox />, count: pending || undefined },
              { key: 'pois', label: t('map.admin.pois'), icon: <MapPin /> },
              { key: 'cache', label: t('map.admin.cache'), icon: <Database /> },
            ]}
          />
        }
      />
      <div className="py-6">
        {tab === 'suggestions' && <SuggestionsTab />}
        {tab === 'pois' && <PoisTab />}
        {tab === 'cache' && <CacheTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- suggestions
function SuggestionsTab() {
  const t = useT();
  const { isZh, formatRelative } = useLocale();
  const qc = useQueryClient();
  const [status, setStatus] = useState<PoiSuggestionStatus>('pending');
  const [rejecting, setRejecting] = useState<PoiSuggestion | null>(null);
  const [reason, setReason] = useState('');
  const list = useQuery({ queryKey: keys.adminSuggestions(status), queryFn: () => mapApi.admin.suggestions(status) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['map', 'admin'] });
    void qc.invalidateQueries({ queryKey: ['map', 'layers'] });
  };
  const approve = useMutation({
    mutationFn: (s: PoiSuggestion) => mapApi.admin.approve(s.id),
    onSuccess: (r) => { toast.success(t('map.admin.approved', { name: (isZh ? r.poi.nameZh : null) ?? r.poi.name })); refresh(); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) => mapApi.admin.reject(v.id, v.reason),
    onSuccess: () => { toast.success(t('map.admin.rejected')); setRejecting(null); setReason(''); refresh(); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        variant="pill"
        label={t('map.admin.suggestions')}
        value={status}
        onChange={setStatus}
        items={[
          { key: 'pending', label: t('map.suggest.status.pending') },
          { key: 'approved', label: t('map.suggest.status.approved') },
          { key: 'rejected', label: t('map.suggest.status.rejected') },
        ]}
        className="self-start"
      />
      {list.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true">{[0, 1].map((i) => <div key={i} className="skeleton h-48 rounded-card" />)}</div>
      ) : list.isError ? (
        <EmptyState size="sm" icon={X} title={t('map.drawer.error')} action={{ label: t('map.error.retry'), onClick: () => void list.refetch() }} />
      ) : !list.data?.items.length ? (
        <EmptyState size="sm" icon={Inbox} title={t('map.admin.suggestionsEmpty')} description={t('map.admin.suggestionsEmptyHint')} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="suggestion-list">
          {list.data.items.map((s) => (
            <li key={s.id} className="flex flex-col overflow-hidden rounded-card border border-line bg-surface" data-testid="suggestion-card">
              <MapView center={[s.lat, s.lng]} zoom={16} height={140} interactive={false} markers={[{ id: s.id, kind: 'poi', lat: s.lat, lng: s.lng, label: isZh ? s.nameZh || s.name : s.name, selected: true }]} aria-label={s.name} />
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-body font-semibold text-ink">{isZh ? s.nameZh || s.name : s.name}</h3>
                    <p className="truncate text-small text-ink-2">{t(poiCategoryKey(s.category))} · {s.campus?.shortName} · {s.address ?? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`}</p>
                  </div>
                  <Badge size="sm" variant={s.status === 'approved' ? 'success' : s.status === 'rejected' ? 'danger' : 'neutral'}>{t(`map.suggest.status.${s.status}`)}</Badge>
                </div>
                {s.note && <p className="rounded-ctl bg-sunken px-3 py-2 text-small text-ink-2">{s.note}</p>}
                {s.reviewReason && <p className="text-small text-ink-2">{t('map.suggest.reason', { reason: s.reviewReason })}</p>}
                <p className="text-caption text-ink-3">{t('map.admin.by', { name: s.user?.name ?? '—', time: formatRelative(s.createdAt) })}</p>
                {s.status === 'pending' && (
                  <div className="mt-auto flex flex-wrap justify-end gap-2 pt-1">
                    <Button size="sm" variant="ghost" iconLeft={<X className="size-4" aria-hidden />} onClick={() => { setRejecting(s); setReason(''); }}>{t('map.admin.reject')}</Button>
                    <Button size="sm" iconLeft={<Check className="size-4" aria-hidden />} loading={approve.isPending && approve.variables?.id === s.id} onClick={() => approve.mutate(s)}>{t('map.admin.approve')}</Button>
                  </div>
                )}
                {s.status === 'approved' && s.poiId && (
                  <Link className="mt-auto self-end text-small text-accent-text hover:underline" to={`/map?c=${s.lat.toFixed(5)},${s.lng.toFixed(5)}&z=17&layers=pois&sel=poi:${s.poiId}`}>{t('map.suggest.viewOnMap')}</Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        size="sm"
        title={t('map.admin.rejectTitle')}
        description={rejecting ? (isZh ? rejecting.nameZh || rejecting.name : rejecting.name) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>{t('map.suggest.cancel')}</Button>
            <Button variant="danger" disabled={reason.trim().length < 2} loading={reject.isPending} onClick={() => rejecting && reject.mutate({ id: rejecting.id, reason: reason.trim() })}>{t('map.admin.reject')}</Button>
          </>
        }
      >
        <Textarea label={t('map.admin.rejectReason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} showCount rows={3} hint={t('map.admin.rejectHint')} />
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- POIs
type PoiForm = { campusId: string; name: string; nameZh: string; category: PoiCategory; lat: string; lng: string; address: string; url: string; tags: string; sortOrder: string; isActive: boolean };

function toForm(p: AdminPoi | null, campusId: string, center: { lat: number; lng: number } | null): PoiForm {
  return p
    ? { campusId: p.campusId, name: p.name, nameZh: p.nameZh ?? '', category: p.category, lat: String(p.lat), lng: String(p.lng), address: p.address ?? '', url: p.url ?? '', tags: p.tags.join(', '), sortOrder: '0', isActive: p.isActive }
    : { campusId, name: '', nameZh: '', category: 'building', lat: center ? center.lat.toFixed(6) : '', lng: center ? center.lng.toFixed(6) : '', address: '', url: '', tags: '', sortOrder: '0', isActive: true };
}

function PoisTab() {
  const t = useT();
  const { isZh } = useLocale();
  const { campuses, campusId: myCampus } = useCampus();
  const qc = useQueryClient();
  const [campusId, setCampusId] = useState<string>(myCampus ?? campuses[0]?.id ?? '');
  const [category, setCategory] = useState<PoiCategory | ''>('');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  const [editing, setEditing] = useState<AdminPoi | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminPoi | null>(null);
  const query = { campusId: campusId || undefined, category: category || undefined, q: dq || undefined };
  const list = useQuery({ queryKey: keys.adminPois(query), queryFn: () => mapApi.admin.pois(query) });
  const campus = campuses.find((c) => c.id === campusId) ?? null;
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['map'] }); };

  const toggle = useMutation({
    mutationFn: (p: AdminPoi) => mapApi.admin.update(p.id, { isActive: !p.isActive }),
    onSuccess: () => { toast.success(t('map.admin.saved')); invalidate(); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const remove = useMutation({
    mutationFn: (p: AdminPoi) => mapApi.admin.remove(p.id),
    onSuccess: () => { toast.success(t('map.admin.deleted')); setDeleting(null); invalidate(); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  const campusOptions = useMemo(() => campuses.map((c) => ({ value: c.id, label: `${c.shortName} · ${c.city}, ${c.state}`, text: `${c.shortName} ${c.name} ${c.city}` })), [campuses]);
  const columns: Column<AdminPoi>[] = [
    { key: 'name', header: t('map.admin.col.name'), render: (p) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold text-ink">{isZh ? p.nameZh ?? p.name : p.name}</span>
        <span className="truncate text-caption text-ink-3">{isZh ? p.name : p.nameZh}</span>
      </span>
    ) },
    { key: 'category', header: t('map.admin.col.category'), width: 120, render: (p) => <Badge size="sm" variant="neutral">{t(poiCategoryKey(p.category))}</Badge> },
    { key: 'coords', header: t('map.admin.col.coords'), width: 170, hideOnMobile: true, render: (p) => <span className="tnum text-small text-ink-2">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span> },
    { key: 'status', header: t('map.admin.col.status'), width: 100, render: (p) => <Badge size="sm" variant={p.isActive ? 'success' : 'neutral'}>{t(p.isActive ? 'map.admin.active' : 'map.admin.inactive')}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="md:w-72"><Select label={t('map.admin.campus')} size="sm" searchable options={campusOptions} value={campusId} onChange={(v) => setCampusId(v)} /></div>
        <div className="md:w-48">
          <Select label={t('map.admin.category')} size="sm" value={category || 'all'} onChange={(v) => setCategory(v === 'all' ? '' : (v as PoiCategory))}
            options={[{ value: 'all', label: t('map.admin.allCategories') }, ...PoiCategory.map((c) => ({ value: c, label: t(poiCategoryKey(c)) }))]} />
        </div>
        <div className="md:flex-1"><Input size="sm" label={t('map.admin.search')} value={search} onChange={(e) => setSearch(e.target.value)} clearable /></div>
        <Button iconLeft={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')} data-testid="poi-new">{t('map.admin.new')}</Button>
      </div>
      <p className="text-small text-ink-2" aria-live="polite">{list.data ? t('map.admin.count', { count: list.data.length }) : ' '}</p>
      <Table<AdminPoi>
        columns={columns}
        rows={list.data ?? []}
        rowKey="id"
        loading={list.isLoading}
        caption={t('map.admin.pois')}
        empty={<EmptyState size="sm" icon={MapPin} title={t('map.admin.empty')} description={t('map.admin.emptyHint')} />}
        rowActions={(p) => (
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" iconOnly aria-label={t('map.admin.edit')} onClick={() => setEditing(p)}><Pencil className="size-4" /></Button>
            <Button size="sm" variant="ghost" iconOnly aria-label={t(p.isActive ? 'map.admin.hide' : 'map.admin.show')} onClick={() => toggle.mutate(p)}>{p.isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button>
            <Button size="sm" variant="ghost" iconOnly aria-label={t('map.admin.delete')} onClick={() => setDeleting(p)}><Trash2 className="size-4" /></Button>
          </span>
        )}
      />
      <PoiFormModal open={editing !== null} poi={editing === 'new' ? null : editing} campusId={campusId} center={campus ? { lat: campus.lat, lng: campus.lng } : null} onClose={() => setEditing(null)} onSaved={invalidate} />
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        size="sm"
        title={t('map.admin.delete')}
        description={deleting ? t('map.admin.deleteConfirm', { name: isZh ? deleting.nameZh ?? deleting.name : deleting.name }) : undefined}
        footer={<><Button variant="ghost" onClick={() => setDeleting(null)}>{t('map.suggest.cancel')}</Button><Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>{t('map.admin.delete')}</Button></>}
      />
    </div>
  );
}

function PoiFormModal({ open, poi, campusId, center, onClose, onSaved }: { open: boolean; poi: AdminPoi | null; campusId: string; center: { lat: number; lng: number } | null; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const { campuses } = useCampus();
  const [f, setF] = useState<PoiForm>(() => toForm(poi, campusId, center));
  useEffect(() => { if (open) setF(toForm(poi, campusId, center)); }, [open, poi, campusId]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof PoiForm>(k: K, v: PoiForm[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = useMutation({
    mutationFn: (body: PoiInput) => (poi ? mapApi.admin.update(poi.id, body) : mapApi.admin.create(body)),
    onSuccess: () => { toast.success(t(poi ? 'map.admin.saved' : 'map.admin.created')); onSaved(); onClose(); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  const lat = Number(f.lat);
  const lng = Number(f.lng);
  const hasPoint = f.lat !== '' && f.lng !== '' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const markers: MapMarker[] = hasPoint ? [{ id: 'poi', kind: 'poi', lat, lng, label: f.nameZh || f.name || '•', selected: true }] : [];
  const fe = (k: string) => fieldError(t, save.error, k);
  const valid = f.name.trim().length > 0 && hasPoint && !!f.campusId;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    save.mutate({
      campusId: f.campusId, name: f.name.trim(), nameZh: f.nameZh.trim() || null, category: f.category, lat, lng,
      address: f.address.trim() || null, url: f.url.trim() || null, icon: null,
      tags: f.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 12), sortOrder: Number(f.sortOrder) || 0, isActive: f.isActive,
    });
  };
  const c = campuses.find((x) => x.id === f.campusId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t(poi ? 'map.admin.edit' : 'map.admin.new')}
      sheetSnap="full"
      footer={<><Button variant="ghost" onClick={onClose}>{t('map.suggest.cancel')}</Button><Button type="submit" form="poi-form" disabled={!valid} loading={save.isPending}>{t('map.admin.save')}</Button></>}
    >
      <form id="poi-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2" noValidate data-testid="poi-form">
        <div className="flex flex-col gap-3">
          <Select label={t('map.admin.campus')} searchable value={f.campusId} onChange={(v) => set('campusId', v)} options={campuses.map((x) => ({ value: x.id, label: `${x.shortName} · ${x.city}, ${x.state}`, text: `${x.shortName} ${x.name}` }))} />
          <Input label={t('map.admin.form.name')} value={f.name} onChange={(e) => set('name', e.target.value)} error={fe('name')} required maxLength={120} />
          <Input label={t('map.admin.form.nameZh')} value={f.nameZh} onChange={(e) => set('nameZh', e.target.value)} maxLength={120} optional />
          <Select label={t('map.admin.category')} value={f.category} onChange={(v) => set('category', v as PoiCategory)} options={PoiCategory.map((x) => ({ value: x, label: t(poiCategoryKey(x)) }))} />
          <Input label={t('map.admin.form.address')} value={f.address} onChange={(e) => set('address', e.target.value)} maxLength={200} optional />
          <Input label={t('map.admin.form.url')} value={f.url} onChange={(e) => set('url', e.target.value)} error={fe('url')} type="url" optional />
          <Input label={t('map.admin.form.tags')} value={f.tags} onChange={(e) => set('tags', e.target.value)} optional />
        </div>
        <div className="flex flex-col gap-3">
          <MapView
            center={hasPoint ? [lat, lng] : c ? [c.lat, c.lng] : undefined}
            zoom={15}
            height={260}
            markers={markers}
            locate={false}
            onMapClick={(p) => { set('lat', p.lat.toFixed(6)); set('lng', p.lng.toFixed(6)); }}
            className="overflow-hidden rounded-card border border-line"
            aria-label={t('map.admin.form.pickHint')}
          />
          <p className="text-caption text-ink-3">{t('map.admin.form.pickHint')}</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('map.admin.form.lat')} value={f.lat} onChange={(e) => set('lat', e.target.value)} inputMode="decimal" error={fe('lat')} />
            <Input label={t('map.admin.form.lng')} value={f.lng} onChange={(e) => set('lng', e.target.value)} inputMode="decimal" error={fe('lng')} />
          </div>
          <Input label={t('map.admin.form.sortOrder')} value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} inputMode="numeric" />
          <Switch label={t('map.admin.form.isActive')} checked={f.isActive} onChange={(v) => set('isActive', v)} />
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- caches
function CacheTab() {
  const t = useT();
  const { campuses } = useCampus();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const stats = useQuery({ queryKey: keys.adminStats, queryFn: mapApi.admin.stats });
  const clear = useMutation({
    mutationFn: () => mapApi.admin.clearCache(0),
    onSuccess: (r) => { toast.success(t('map.admin.clearCacheDone', { n: r.deleted + r.commuteDeleted })); setConfirm(false); void qc.invalidateQueries({ queryKey: keys.adminStats }); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const s = stats.data;
  const nameOf = (id: string) => campuses.find((c) => c.id === id)?.shortName ?? id;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t('map.admin.stats.pois')} value={s?.pois.active ?? 0} hint={s ? t('map.admin.stats.poisTotal', { n: s.pois.total }) : undefined} format="number" />
        <StatTile label={t('map.admin.stats.geocode')} value={s?.geocodeCache.forward ?? 0} hint={s ? t('map.admin.stats.reverse', { n: s.geocodeCache.reverse }) : undefined} format="number" />
        <StatTile label={t('map.admin.stats.hits')} value={s?.geocodeCache.hits ?? 0} format="number" />
        <StatTile label={t('map.admin.stats.commute')} value={s?.commuteCache ?? 0} format="number" />
      </div>
      {s && (
        <p className="flex flex-wrap items-center gap-2 text-small text-ink-2">
          <Badge size="sm" variant={s.offline ? 'warning' : 'success'}>{t(s.offline ? 'map.admin.stats.offline' : 'map.admin.stats.online')}</Badge>
          {t('map.admin.offlineHint')}
        </p>
      )}
      {s && s.byCampus.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-h3 text-ink">{t('map.admin.byCampus')}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {s.byCampus.map((r) => (
              <li key={r.campusId} className="flex items-center justify-between rounded-card border border-line bg-surface px-3 py-2 text-small">
                <span className="text-ink">{nameOf(r.campusId)}</span><span className="tnum text-ink-2">{r.n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div>
        <Button variant="secondary" iconLeft={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirm(true)}>{t('map.admin.clearCache')}</Button>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} size="sm" title={t('map.admin.clearCache')} description={t('map.admin.clearCacheConfirm')}
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>{t('map.suggest.cancel')}</Button><Button variant="danger" loading={clear.isPending} onClick={() => clear.mutate()}>{t('map.admin.clearCache')}</Button></>} />
    </div>
  );
}
