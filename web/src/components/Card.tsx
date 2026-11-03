import { forwardRef, type ElementType, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Element to render: 'div' (default), 'a', 'article', 'section', 'li', or a component (e.g. Link). */
  as?: ElementType
  /** Adds hover (border-line-strong + shadow-sm), pressed and focus states. */
  interactive?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  variant?: 'default' | 'sunken' | 'outline-accent'
  /** Extra props for custom `as` components (e.g. `to` for Link) */
  [key: `data-${string}`]: unknown
  to?: string
  href?: string
}

const PAD = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' }

/** DESIGN.md §5 Card: the chassis of every card. `bg-surface border line rounded-card`, no resting shadow. */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as, interactive, padding = 'md', variant = 'default', className, ...rest },
  ref,
) {
  const Tag: ElementType = as ?? 'div'
  return (
    <Tag
      ref={ref}
      data-variant={variant}
      data-interactive={interactive || undefined}
      className={cn(
        'relative block rounded-card border',
        variant === 'default' && 'border-line bg-surface',
        variant === 'sunken' && 'border-transparent bg-sunken',
        variant === 'outline-accent' && 'border-accent bg-surface',
        interactive &&
          'cursor-pointer transition-[border-color,box-shadow,transform] duration-token-base ease-out [@media(hover:hover)]:hover:border-line-strong [@media(hover:hover)]:hover:shadow-sm active:translate-y-px',
        PAD[padding],
        className,
      )}
      {...rest}
    />
  )
})
