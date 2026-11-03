import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode
  /** small ink-2 under the title */
  subtitle?: ReactNode
  /** Route for the 「查看全部 →」 ghost link */
  to?: string
  /** Label override for the link (default ui.viewAll) */
  linkLabel?: ReactNode
  /** Custom right-side content (replaces the link) */
  actions?: ReactNode
  as?: 'section' | 'div'
  /** Heading level; h2 by default */
  headingLevel?: 'h2' | 'h3'
}

/** `h2` section title + optional 「查看全部 →」 link on the right; vertical rhythm per DESIGN.md §6.3. */
export const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  { title, subtitle, to, linkLabel, actions, as = 'section', headingLevel = 'h2', className, children, ...rest },
  ref,
) {
  const t = useT()
  const Tag = as
  const H = headingLevel
  return (
    <Tag ref={ref as never} className={cn('flex flex-col gap-4', className)} {...rest}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <H className={headingLevel === 'h2' ? 'text-h2 text-ink' : 'text-h3 text-ink'}>{title}</H>
          {subtitle && <p className="mt-1 text-small text-ink-2">{subtitle}</p>}
        </div>
        {actions ??
          (to ? (
            <Link
              to={to}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-ctl px-2 text-small font-medium text-ink-2 transition-colors duration-token-fast hover:bg-sunken hover:text-ink"
            >
              {linkLabel ?? t('ui.viewAll')}
              <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
            </Link>
          ) : null)}
      </div>
      {children}
    </Tag>
  )
})
