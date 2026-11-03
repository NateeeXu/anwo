import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'accent' | 'inverse'
  size?: 'sm' | 'md'
  icon?: ReactNode
  /** Shows an × remove button */
  onRemove?: () => void
}

const VARIANT = {
  default: 'bg-sunken text-ink-2',
  accent: 'bg-accent-soft text-accent-text-strong border border-accent-soft-line',
  inverse: 'bg-inverse text-ink-inverse',
}

/** DESIGN.md §5 Chip: static pill for conditions, tags, categories. For toggles use FilterChip. */
export const Chip = forwardRef<HTMLSpanElement, ChipProps>(function Chip(
  { variant = 'default', size = 'md', icon, onRemove, className, children, ...rest },
  ref,
) {
  const t = useT()
  return (
    <span
      ref={ref}
      data-variant={variant}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill font-medium',
        size === 'sm' ? 'h-7 px-2.5 text-caption' : 'h-8 px-3 text-small',
        VARIANT[variant],
        onRemove && 'pr-1.5',
        className,
      )}
      {...rest}
    >
      {icon && (
        <span className="inline-flex shrink-0 [&>svg]:size-3.5" aria-hidden>
          {icon}
        </span>
      )}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('ui.remove')}
          className="-my-1 inline-flex size-5 items-center justify-center rounded-pill opacity-70 transition-opacity hover:opacity-100 hover:bg-black/10"
        >
          <X size={12} strokeWidth={2.5} aria-hidden />
        </button>
      )}
    </span>
  )
})
