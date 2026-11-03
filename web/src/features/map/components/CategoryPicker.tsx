// POI category as a chip radiogroup (13 options, each with its icon). Used inside modals, where the kit's custom
// Select listbox renders under the modal scrim (see docs/modules/map.md → Integration requests).
import { useId, useRef } from 'react';
import { PoiCategory } from '@shared/enums';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { POI_ICONS, poiCategoryKey } from '../labels';

export type CategoryPickerProps = {
  label: string;
  value: PoiCategory | '' | null;
  onChange: (v: PoiCategory) => void;
  error?: string;
  className?: string;
};

export function CategoryPicker({ label, value, onChange, error, className }: CategoryPickerProps) {
  const t = useT();
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = value ? PoiCategory.indexOf(value) : -1;

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + PoiCategory.length) % PoiCategory.length;
    onChange(PoiCategory[next]!);
    refs.current[next]?.focus();
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span id={`${id}-label`} className="text-caption text-ink-2">{label}</span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={error ? `${id}-err` : undefined} className="flex flex-wrap gap-1.5">
        {PoiCategory.map((c, i) => {
          const Icon = POI_ICONS[c];
          const on = value === c;
          return (
            <button
              key={c}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
              onClick={() => onChange(c)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-pill border px-3 text-small transition-colors duration-token-fast',
                on ? 'border-inverse bg-inverse text-ink-inverse' : 'border-line-strong bg-surface text-ink-2 hover:bg-sunken hover:text-ink',
              )}
            >
              <Icon className="size-3.5" aria-hidden strokeWidth={1.75} />
              {t(poiCategoryKey(c))}
            </button>
          );
        })}
      </div>
      {error && <span id={`${id}-err`} className="text-small text-danger">{error}</span>}
    </div>
  );
}

export default CategoryPicker;
