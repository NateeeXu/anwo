// Legend card (bottom-left on desktop, inside the "more" sheet on mobile) — the same pin DOM as the map.
import { ClusterPin, PricePin } from '@/components/map';
import { Mark } from '@/components/brand';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

export function MapLegend({ className, compact }: { className?: string; compact?: boolean }) {
  const t = useT();
  const rows: { key: string; swatch: React.ReactNode; label: string }[] = [
    { key: 'listing', swatch: <PricePin label="$1,250" className="scale-[.8] origin-left" />, label: t('map.legend.listing') },
    { key: 'item', swatch: <PricePin label="$40" kind="item" className="scale-[.8] origin-left" />, label: t('map.legend.item') },
    { key: 'buddy', swatch: <PricePin label="11/08" kind="buddy" className="scale-[.8] origin-left" />, label: t('map.legend.buddy') },
    { key: 'boosted', swatch: <PricePin label="$980" boosted className="scale-[.8] origin-left" />, label: t('map.legend.boosted') },
    { key: 'stop', swatch: <span className="ml-1 inline-block size-2.5 rounded-full border-2 border-ink bg-surface" aria-hidden />, label: t('map.legend.stop') },
    { key: 'poi', swatch: <span className="ml-1 inline-block size-3 rounded-full border-2 border-ink-2 bg-surface" aria-hidden />, label: t('map.legend.poi') },
    { key: 'campus', swatch: <span className="inline-flex size-6 items-center justify-center rounded-ctl border border-line bg-surface"><Mark size={20} title={null} /></span>, label: t('map.legend.campus') },
    { key: 'cluster', swatch: <ClusterPin count={12} className="scale-[.7] origin-left" />, label: t('map.legend.cluster') },
  ];
  return (
    <div className={cn('rounded-card border border-line bg-surface shadow-md', compact ? 'p-3' : 'p-3', className)} aria-label={t('map.legend.title')} role="group">
      <p className="mb-2 text-caption font-semibold text-ink-3">{t('map.legend.title')}</p>
      <ul className={cn('grid gap-x-4 gap-y-1.5', compact ? 'grid-cols-2' : 'grid-cols-1')}>
        {rows.map((r) => (
          <li key={r.key} className="flex h-7 items-center gap-2 text-caption text-ink-2">
            <span className="flex w-14 shrink-0 items-center">{r.swatch}</span>
            <span className="truncate">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MapLegend;
