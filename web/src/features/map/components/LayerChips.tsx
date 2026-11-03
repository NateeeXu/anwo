// Layer toggle chips 「房源 · 二手 · 搭子 · 校车 · 校园设施」 (DESIGN §7.9). Multi-select with per-layer counts.
import type { LayerCounts, MapLayer } from '@shared/schemas/map';
import { FilterChip } from '@/components';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { LAYER_ICONS, LAYER_ORDER } from '../labels';

export type LayerChipsProps = {
  layers: MapLayer[];
  counts?: LayerCounts | null;
  onToggle: (layer: MapLayer) => void;
  size?: 'sm' | 'md';
  className?: string;
  /** horizontal scroll row (mobile) */
  scroll?: boolean;
};

export function LayerChips({ layers, counts, onToggle, size = 'sm', className, scroll }: LayerChipsProps) {
  const t = useT();
  return (
    <div role="group" aria-label={t('map.layers.label')} className={cn('flex gap-1.5', scroll ? 'no-scrollbar overflow-x-auto' : 'flex-wrap', className)}>
      {LAYER_ORDER.map((layer) => {
        const Icon = LAYER_ICONS[layer];
        const on = layers.includes(layer);
        return (
          <FilterChip key={layer} size={size} selected={on} icon={<Icon className="size-3.5" aria-hidden />} count={on && counts ? counts[layer] : undefined} onClick={() => onToggle(layer)} className="shrink-0">
            {t(`map.layer.${layer}`)}
          </FilterChip>
        );
      })}
    </div>
  );
}

export default LayerChips;
