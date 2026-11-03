// AreaPicker — up to 5 preferred areas: circles drawn on MapView (click to place, slider for radius), a city/state, or a campus.
import { Globe, MapPin, School } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMapEvents } from 'react-leaflet';
import type { Campus } from '@shared/types';
import type { AreaInput } from '@shared/schemas/wanted';
import { Button, Chip, Input, SegmentedControl, Select } from '@/components';
import { MapView, type MapCircle, type MapMarker } from '@/components/map';
import { campusCenter, zoomForRadius } from '@/lib/geo';
import { cn } from '@/lib/cn';
import { useCampus } from '@/lib/campus';
import { useLocale, useT } from '@/lib/i18n';
import { areaKey, US_STATES } from '../lib';

type Mode = 'circle' | 'city' | 'campus';
export const MAX_AREAS = 5;
const RADII = [500, 800, 1000, 1500, 2000, 3000, 5000, 8000, 12000, 20000, 30000];

function ClickCatcher({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export interface AreaPickerProps {
  value: AreaInput[];
  onChange: (areas: AreaInput[]) => void;
  /** campus the post belongs to (map centre) */
  campus: Campus | null;
  error?: string;
  className?: string;
}

export function AreaPicker({ value, onChange, campus, error, className }: AreaPickerProps) {
  const t = useT();
  const { formatDistance, locale } = useLocale();
  const { campuses } = useCampus();
  const [mode, setMode] = useState<Mode>('circle');
  const [label, setLabel] = useState('');
  const [radius, setRadius] = useState(1500);
  const [selected, setSelected] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [state, setState] = useState<string>(campus?.state ?? 'IL');
  const [campusPick, setCampusPick] = useState<string>(campus?.id ?? '');
  const full = value.length >= MAX_AREAS;

  const circles: MapCircle[] = value
    .filter((a): a is Extract<AreaInput, { kind: 'circle' }> => a.kind === 'circle')
    .map((a) => ({ id: areaKey(a), lat: a.lat, lng: a.lng, radiusM: a.radiusM, kind: 'area' }));
  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    if (campus) out.push({ id: 'campus', kind: 'campus', lat: campus.lat, lng: campus.lng, label: campus.shortName });
    for (const a of value) {
      if (a.kind === 'circle') out.push({ id: areaKey(a), kind: 'poi', lat: a.lat, lng: a.lng, label: a.label, selected: selected === areaKey(a) });
      if (a.kind === 'campus') {
        const c = campuses.find((x) => x.id === a.campusId);
        if (c && c.id !== campus?.id) out.push({ id: areaKey(a), kind: 'campus', lat: c.lat, lng: c.lng, label: c.shortName });
      }
    }
    return out;
  }, [value, campus, campuses, selected]);

  const add = (a: AreaInput) => {
    if (full) return;
    const k = areaKey(a);
    if (value.some((v) => areaKey(v) === k)) return;
    onChange([...value, a]);
    setSelected(k);
    setLabel('');
  };
  const remove = (k: string) => {
    onChange(value.filter((v) => areaKey(v) !== k));
    if (selected === k) setSelected(null);
  };
  const updateRadius = (k: string, r: number) => onChange(value.map((v) => (areaKey(v) === k && v.kind === 'circle' ? { ...v, radiusM: r } : v)));

  const onMapClick = (lat: number, lng: number) => {
    if (mode !== 'circle') return;
    if (full) return;
    const n = value.filter((v) => v.kind === 'circle').length + 1;
    add({ kind: 'circle', label: label.trim() || t('wanted.areas.autoLabel', { n }), lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, radiusM: radius });
  };

  const selectedCircle = value.find((v) => v.kind === 'circle' && areaKey(v) === selected) as Extract<AreaInput, { kind: 'circle' }> | undefined;
  const campusOptions = useMemo(
    () => campuses.map((c) => ({ value: c.id, label: locale === 'zh-CN' && c.nameZh ? `${c.nameZh} · ${c.shortName}` : c.name, description: `${c.city}, ${c.state}`, text: `${c.name} ${c.nameZh ?? ''} ${c.city}` })),
    [campuses, locale],
  );

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          size="sm"
          value={mode}
          onChange={(v) => setMode(v)}
          options={[
            { value: 'circle', label: t('wanted.areas.mode.circle'), icon: <MapPin /> },
            { value: 'city', label: t('wanted.areas.mode.city'), icon: <Globe /> },
            { value: 'campus', label: t('wanted.areas.mode.campus'), icon: <School /> },
          ]}
          label={t('wanted.areas.modeLabel')}
        />
        <span className="text-caption text-ink-3 tabular-nums">{t('wanted.areas.count', { n: value.length, max: MAX_AREAS })}</span>
      </div>

      {mode === 'circle' && (
        <div className="flex flex-col gap-2">
          <p className="text-small text-ink-2">{full ? t('wanted.areas.full') : t('wanted.areas.circleHint')}</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Input size="sm" label={t('wanted.areas.label')} optional value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder={t('wanted.areas.labelPlaceholder')} />
            <Select
              size="sm"
              label={t('wanted.areas.radius')}
              value={String(selectedCircle?.radiusM ?? radius)}
              onChange={(v) => { const r = Number(v); setRadius(r); if (selectedCircle) updateRadius(areaKey(selectedCircle), r); }}
              options={RADII.map((r) => ({ value: String(r), label: formatDistance(r) }))}
              className="sm:w-40"
            />
          </div>
          <MapView
            center={campusCenter(campus)}
            zoom={campus ? zoomForRadius(campus.defaultRadiusM ?? 3000, 600, campus.lat) : 12}
            height={300}
            markers={markers}
            circles={circles}
            onMarkerClick={(id) => setSelected(id === 'campus' ? null : id)}
            fitToMarkers={false}
            locate={false}
            clusterThreshold={Infinity}
            className="rounded-card"
            aria-label={t('wanted.areas.mapLabel')}
          >
            <ClickCatcher onClick={onMapClick} />
          </MapView>
        </div>
      )}

      {mode === 'city' && (
        <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto] sm:items-end">
          <Input size="sm" label={t('wanted.areas.city')} value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} placeholder="Chicago" />
          <Select size="sm" label={t('wanted.areas.state')} value={state} onChange={(v) => setState(v)} options={US_STATES.map((s) => ({ value: s, label: s }))} searchable />
          <Button
            size="md"
            variant="secondary"
            disabled={!city.trim() || full}
            onClick={() => { const c = city.trim(); add({ kind: 'city', label: `${c}, ${state}`, city: c, state }); setCity(''); }}
          >
            {t('wanted.areas.add')}
          </Button>
        </div>
      )}

      {mode === 'campus' && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <Select size="sm" label={t('wanted.areas.campus')} value={campusPick} onChange={(v) => setCampusPick(v)} options={campusOptions} searchable placeholder={t('wanted.areas.campusPlaceholder')} />
          <Button
            size="md"
            variant="secondary"
            disabled={!campusPick || full}
            onClick={() => { const c = campuses.find((x) => x.id === campusPick); if (c) add({ kind: 'campus', label: c.shortName, campusId: c.id }); }}
          >
            {t('wanted.areas.add')}
          </Button>
        </div>
      )}

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('wanted.areas.chosen')}>
          {value.map((a) => {
            const k = areaKey(a);
            return (
              <li key={k}>
                <Chip
                  size="md"
                  variant={selected === k ? 'accent' : 'default'}
                  icon={a.kind === 'city' ? <Globe /> : a.kind === 'campus' ? <School /> : <MapPin />}
                  onRemove={() => remove(k)}
                  onClick={() => setSelected(a.kind === 'circle' ? k : null)}
                  className="cursor-pointer"
                >
                  {a.label}
                  {a.kind === 'circle' && <span className="ml-1 text-ink-3">{formatDistance(a.radiusM)}</span>}
                </Chip>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-small text-danger" role="alert">{error}</p>}
    </div>
  );
}

export default AreaPicker;
