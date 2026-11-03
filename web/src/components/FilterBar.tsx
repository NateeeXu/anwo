import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'
import { Button } from './Button'
import { FilterChip, type FilterChipProps } from './FilterChip'
import { SegmentedControl } from './SegmentedControl'
import { Select, type SelectOption } from './Select'

export interface FilterChipItem extends Omit<FilterChipProps, 'children'> {
  key: string
  label: ReactNode
}

export interface FilterBarProps extends HTMLAttributes<HTMLDivElement> {
  chips?: FilterChipItem[]
  /** Sort select */
  sort?: { value: string; options: SelectOption[]; onChange: (v: string) => void; label?: ReactNode }
  resultCount?: number
  /** Shown as a ghost 「重置」 when any chip is selected */
  onReset?: () => void
  sticky?: boolean
  /** 校区 / 全美 toggle */
  scopeToggle?: { value: 'campus' | 'nationwide'; onChange: (v: 'campus' | 'nationwide') => void; campusLabel?: ReactNode; nationwideDisabled?: boolean }
  /** Extra controls on the right (e.g. map/list SegmentedControl) */
  trailing?: ReactNode
  /** Extra chips/content rendered inside the scroll row after `chips` */
  children?: ReactNode
}

/** DESIGN.md §5 FilterBar: scrollable chip row with fade edges, h-56, sticky `bg-paper/95`; right: count + sort. */
export const FilterBar = forwardRef<HTMLDivElement, FilterBarProps>(function FilterBar(
  { chips = [], sort, resultCount, onReset, sticky, scopeToggle, trailing, className, children, ...rest },
  ref,
) {
  const t = useT()
  const anySelected = chips.some((c) => c.selected)
  return (
    <div
      ref={ref}
      className={cn('flex min-h-14 items-center gap-3 bg-paper/95 py-2', sticky && 'sticky top-0 z-layer-sticky -mx-4 px-4 md:-mx-8 md:px-8', className)}
      {...rest}
    >
      {scopeToggle && (
        <SegmentedControl
          size="sm"
          value={scopeToggle.value}
          onChange={scopeToggle.onChange}
          options={[
            { value: 'campus', label: scopeToggle.campusLabel ?? t('ui.scope.campus') },
            { value: 'nationwide', label: t('ui.scope.nationwide'), disabled: scopeToggle.nationwideDisabled },
          ]}
          className="shrink-0"
        />
      )}
      <div className="no-scrollbar fade-x -my-2 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-2">
        {chips.map(({ key, label, ...chip }) => (
          <FilterChip key={key} {...chip}>
            {label}
          </FilterChip>
        ))}
        {children}
        {anySelected && onReset && (
          <Button variant="ghost" size="sm" onClick={onReset} className="shrink-0">
            {t('ui.reset')}
          </Button>
        )}
      </div>
      {(resultCount != null || sort || trailing) && (
        <div className="flex shrink-0 items-center gap-3">
          {/* count + sort are desktop-only; on mobile modules put sort inside their filter Sheet (DESIGN.md §7.2) */}
          {resultCount != null && (
            <span className="text-small text-ink-2 tabular-nums max-md:hidden" aria-live="polite">
              {t('ui.resultCount', { count: resultCount })}
            </span>
          )}
          {sort && (
            <Select
              size="sm"
              value={sort.value}
              options={sort.options}
              onChange={sort.onChange}
              aria-label={typeof sort.label === 'string' ? sort.label : t('ui.sortBy')}
              className="max-md:hidden"
              triggerClassName="w-auto min-w-[120px]"
            />
          )}
          {trailing}
        </div>
      )}
    </div>
  )
})
