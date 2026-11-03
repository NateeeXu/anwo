// Scrollable category chip row with icons (DESIGN §7.11): 全部 · 家具 · 电子 · 课本 · 厨房 · 自行车 · … · 免费.
import { LayoutGrid } from 'lucide-react';
import type { MarketCategory } from '@shared/enums';
import { MARKET_BROWSE_CATEGORIES } from '@shared/schemas/market';
import { FilterChip } from '@/components';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { CategoryIcon } from './shared';

export function CategoryChips({ value, onChange, counts, className }: { value: MarketCategory | null; onChange: (c: MarketCategory | null) => void; counts?: Record<string, number>; className?: string }) {
  const t = useT();
  return (
    <div role="group" aria-label={t('market.form.category')} className={cn('no-scrollbar fade-x -mx-4 flex gap-2 overflow-x-auto px-4 py-1 lg:mx-0 lg:px-0', className)}>
      <FilterChip selected={value === null} onClick={() => onChange(null)} icon={<LayoutGrid className="size-4" strokeWidth={1.75} aria-hidden />} className="shrink-0">
        {t('market.cat.all')}
      </FilterChip>
      {MARKET_BROWSE_CATEGORIES.map((c) => {
        const n = counts?.[c];
        if (counts && !n && value !== c) return null;
        return (
          <FilterChip key={c} selected={value === c} onClick={() => onChange(value === c ? null : c)} icon={<CategoryIcon category={c} />} count={n || undefined} className="shrink-0">
            {t(`market.cat.${c}`)}
          </FilterChip>
        );
      })}
    </div>
  );
}

export default CategoryChips;
