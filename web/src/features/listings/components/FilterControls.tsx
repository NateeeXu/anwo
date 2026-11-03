// Filter widgets shared by the FilterBar chip menus (desktop) and the full filter Sheet (mobile / 「更多筛选」).
import { useMemo } from 'react';
import { Amenity, Furnished, GenderPref, ListingType, PropertyType } from '@shared/enums';
import { Checkbox, DateRange, FilterChip, PriceRange, Select, Switch } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { datePresets, type Filters } from '../filters';
import type { PriceStats } from '../api';

export const PRICE_BOUNDS: [number, number] = [0, 350_000];
const BEDROOMS = ['0', '1', '2', '3', '4+'] as const;
const BED_KEYS: Record<(typeof BEDROOMS)[number], string> = { '0': 'listings.filter.studio', '1': 'listings.filter.bed1', '2': 'listings.filter.bed2', '3': 'listings.filter.bed3', '4+': 'listings.filter.bed4plus' };

export type Patch = (p: Partial<Filters>) => void;

function toggleIn(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function DatesControl({ f, patch }: { f: Filters; patch: Patch }) {
  const t = useT();
  const presets = useMemo(() => datePresets().map((p) => ({ ...p, label: t(`listings.filter.preset${p.key[0]!.toUpperCase()}${p.key.slice(1)}`) })), [t]);
  return (
    <div className="flex flex-col gap-2">
      <DateRange value={{ start: f.availableFrom, end: f.availableTo }} onChange={(v) => patch({ availableFrom: v.start, availableTo: v.end, page: 1 })} presets={presets} months={1} />
      <p className="text-caption text-ink-3">{t('listings.filter.datesHint')}</p>
    </div>
  );
}

export function PriceControl({ f, patch, stats }: { f: Filters; patch: Patch; stats?: PriceStats }) {
  const t = useT();
  const { formatMoney } = useLocale();
  const bounds = stats?.bounds ?? PRICE_BOUNDS;
  const value: [number, number] = [f.priceMin ?? bounds[0], f.priceMax ?? bounds[1]];
  return (
    <div className="flex w-full flex-col gap-2 md:w-[320px]">
      <PriceRange
        value={value}
        bounds={bounds}
        step={stats?.step ?? 5000}
        histogram={stats?.histogram}
        unit="/mo"
        onChange={([min, max]) => patch({ priceMin: min <= bounds[0] ? null : min, priceMax: max >= bounds[1] ? null : max, page: 1 })}
      />
      {stats && stats.count > 0 && <p className="text-caption text-ink-3">{t('listings.filter.histogramHint', { count: stats.count, median: formatMoney(stats.medianPriceCents) })}</p>}
    </div>
  );
}

export function BedroomsControl({ f, patch }: { f: Filters; patch: Patch }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('listings.filter.bedroomsTitle')}>
        {BEDROOMS.map((b) => (
          <FilterChip key={b} selected={f.bedrooms.includes(b)} onClick={() => patch({ bedrooms: toggleIn(f.bedrooms, b), page: 1 })}>{t(BED_KEYS[b])}</FilterChip>
        ))}
      </div>
      <Select
        label={t('listings.filter.bathroomsMin')}
        size="sm"
        value={f.bathroomsMin === null ? 'any' : String(f.bathroomsMin)}
        onChange={(v) => patch({ bathroomsMin: v === 'any' ? null : Number(v), page: 1 })}
        options={[{ value: 'any', label: t('listings.filter.any') }, { value: '1', label: '1+' }, { value: '1.5', label: '1.5+' }, { value: '2', label: '2+' }]}
      />
    </div>
  );
}

function EnumChips({ label, values, selected, onToggle, keyPrefix }: { label: string; values: readonly string[]; selected: string[]; onToggle: (v: string) => void; keyPrefix: string }) {
  const t = useT();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-small font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <FilterChip key={v} size="sm" selected={selected.includes(v)} onClick={() => onToggle(v)}>{t(`${keyPrefix}.${v}`)}</FilterChip>
        ))}
      </div>
    </fieldset>
  );
}

/** Everything behind 「更多筛选」. Also the body of the mobile filter sheet (with `full`). */
export function MoreFilters({ f, patch, full, stats, className }: { f: Filters; patch: Patch; full?: boolean; stats?: PriceStats; className?: string }) {
  const t = useT();
  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {full && (
        <>
          <section className="flex flex-col gap-2">
            <h3 className="text-small font-medium text-ink">{t('listings.filter.dates')}</h3>
            <DatesControl f={f} patch={patch} />
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-small font-medium text-ink">{t('listings.filter.priceTitle')}</h3>
            <PriceControl f={f} patch={patch} stats={stats} />
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-small font-medium text-ink">{t('listings.filter.bedroomsTitle')}</h3>
            <BedroomsControl f={f} patch={patch} />
          </section>
        </>
      )}
      <EnumChips label={t('listings.filter.furnished')} values={Furnished} selected={f.furnished} keyPrefix="listings.furnished" onToggle={(v) => patch({ furnished: toggleIn(f.furnished, v), page: 1 })} />
      <EnumChips label={t('listings.filter.listingType')} values={ListingType} selected={f.listingType} keyPrefix="listings.type" onToggle={(v) => patch({ listingType: toggleIn(f.listingType, v), page: 1 })} />
      <EnumChips label={t('listings.filter.propertyType')} values={PropertyType} selected={f.propertyType} keyPrefix="listings.prop" onToggle={(v) => patch({ propertyType: toggleIn(f.propertyType, v), page: 1 })} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label={t('listings.filter.genderPref')}
          size="sm"
          value={f.genderPref ?? 'all'}
          onChange={(v) => patch({ genderPref: v === 'all' ? null : (v as Filters['genderPref']), page: 1 })}
          options={[{ value: 'all', label: t('listings.filter.any') }, ...GenderPref.map((g) => ({ value: g, label: t(`listings.detail.gender.${g}`) }))]}
        />
        <Select
          label={t('listings.filter.minTermMax')}
          size="sm"
          value={f.minTermMax === null ? 'any' : String(f.minTermMax)}
          onChange={(v) => patch({ minTermMax: v === 'any' ? null : Number(v), page: 1 })}
          options={[{ value: 'any', label: t('listings.filter.any') }, ...[1, 2, 3, 6, 12].map((n) => ({ value: String(n), label: t('listings.filter.months', { n }) }))]}
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Switch label={t('listings.filter.nearShuttle')} checked={f.nearShuttle} onChange={(v) => patch({ nearShuttle: v, page: 1 })} size="sm" />
        <Switch label={t('listings.filter.pets')} checked={f.petsAllowed} onChange={(v) => patch({ petsAllowed: v, page: 1 })} size="sm" />
        <Switch label={t('listings.filter.parking')} checked={f.parking} onChange={(v) => patch({ parking: v, page: 1 })} size="sm" />
        <Switch label={t('listings.filter.utilities')} checked={f.utilitiesIncluded} onChange={(v) => patch({ utilitiesIncluded: v, page: 1 })} size="sm" />
        <Switch label={t('listings.filter.verifiedHost')} checked={f.verifiedOnly} onChange={(v) => patch({ verifiedOnly: v, page: 1 })} size="sm" />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-small font-medium text-ink">{t('listings.filter.amenities')}</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {Amenity.map((a) => (
            <Checkbox key={a} label={t(`listings.amenity.${a}`)} checked={f.amenities.includes(a)} onChange={() => patch({ amenities: toggleIn(f.amenities, a), page: 1 })} />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
