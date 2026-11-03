import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { useLocale, useT } from '@/lib/i18n'

export interface PriceProps extends HTMLAttributes<HTMLSpanElement> {
  /** integer cents USD */
  cents: number
  /** append `/mo` (zh: ` / 月`; `stub` style uses `/mo` in both) */
  perMonth?: boolean
  /** 免费 / Free */
  isFree?: boolean
  /** 可议价 / OBO */
  obo?: boolean
  /** `stub`: the ink price stub from §4.1 (bg-inverse); `lg`: price-lg; `md`: price; `inline`: inherit size, bold tabular. */
  size?: 'inline' | 'md' | 'lg' | 'stub'
  /** Range upper bound → `$900–1,200` */
  maxCents?: number
}

/** Formats cents per DESIGN.md §8 with tabular numerals. */
export const Price = forwardRef<HTMLSpanElement, PriceProps>(function Price(
  { cents, perMonth, isFree, obo, size = 'md', maxCents, className, ...rest },
  ref,
) {
  const { formatMoney, formatMoneyRange, formatPrice, locale } = useLocale()
  const t = useT()
  let text: string
  if (isFree || (cents === 0 && !perMonth)) text = t('ui.free')
  else if (maxCents != null) text = formatMoneyRange(cents, maxCents) + (perMonth ? (size === 'stub' || locale === 'en' ? '/mo' : ' / 月') : '')
  else if (obo) text = formatPrice({ priceCents: cents, obo: true })
  else text = formatMoney(cents, { perMonth, compact: size === 'stub' })
  return (
    <span
      ref={ref}
      className={cn(
        'price tabular-nums',
        size === 'lg' && 'text-price-lg',
        size === 'md' && 'text-price',
        size === 'inline' && 'font-bold',
        size === 'stub' && 'relative inline-flex h-8 items-center rounded-sm bg-inverse px-2.5 text-price text-ink-inverse',
        className,
      )}
      {...rest}
    >
      {text}
    </span>
  )
})
