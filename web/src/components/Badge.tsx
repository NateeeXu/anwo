import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'boosted' | 'sponsored' | 'pro'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  icon?: ReactNode
  size?: 'sm' | 'md'
}

const VARIANT: Record<BadgeVariant, string> = {
  neutral: 'bg-sunken text-ink-2',
  accent: 'bg-accent-soft text-accent-text-strong border border-accent-soft-line',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  boosted: 'bg-accent-soft text-accent-text-strong border border-accent-soft-line',
  sponsored: 'bg-sunken text-ink-2 border border-line',
  pro: 'bg-sunken text-ink border border-line',
}

/** DESIGN.md §5 Badge. `boosted` / `sponsored` / `pro` carry their own default label (§4.8). */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'neutral', icon, size = 'md', className, children, title, ...rest },
  ref,
) {
  const t = useT()
  let content: ReactNode = children
  let ic = icon
  let tip = title
  if (variant === 'boosted') {
    content ??= t('ui.boosted')
    ic ??= <ArrowUpRight />
    tip ??= t('ui.boostedTip')
  } else if (variant === 'sponsored') {
    content ??= t('ui.sponsored')
    tip ??= t('ui.sponsoredTip')
  } else if (variant === 'pro') {
    content ??= t('ui.pro')
  }
  return (
    <span
      ref={ref}
      data-variant={variant}
      title={tip}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-caption',
        size === 'sm' ? 'h-[18px] px-1' : 'h-[22px]',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {ic && (
        <span className="inline-flex shrink-0 [&>svg]:size-3" aria-hidden>
          {ic}
        </span>
      )}
      {content}
    </span>
  )
})
