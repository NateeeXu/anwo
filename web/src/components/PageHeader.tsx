import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'

export interface Crumb {
  label: ReactNode
  to?: string
}

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode
  subtitle?: ReactNode
  breadcrumb?: Crumb[]
  /** Right-aligned actions (buttons) */
  actions?: ReactNode
  /** A `<Tabs>` row rendered under the title (removes the hairline) */
  tabs?: ReactNode
  /** Mobile back chevron: `true` = history back, string = route */
  back?: boolean | string
  /** Sticky on mobile (default true when `back` is set) */
  sticky?: boolean
}

/** DESIGN.md §5 PageHeader: h1, pb-16, hairline below unless `tabs`; mobile sticky with back chevron. */
export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  { title, subtitle, breadcrumb, actions, tabs, back, sticky, className, ...rest },
  ref,
) {
  const t = useT()
  const navigate = useNavigate()
  const isSticky = sticky ?? !!back
  return (
    <header
      ref={ref}
      className={cn(
        'flex flex-col gap-3',
        !tabs && 'border-b border-line pb-4',
        tabs && 'pb-0',
        isSticky && 'max-md:sticky max-md:top-0 max-md:z-layer-sticky max-md:-mx-4 max-md:bg-paper/95 max-md:px-4 max-md:pt-2',
        className,
      )}
      {...rest}
    >
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="breadcrumb" className="max-md:hidden">
          <ol className="flex flex-wrap items-center gap-1 text-small text-ink-3">
            {breadcrumb.map((c, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={14} strokeWidth={1.75} aria-hidden />}
                {c.to && i < breadcrumb.length - 1 ? (
                  <Link to={c.to} className="hover:text-ink">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={i === breadcrumb.length - 1 ? 'page' : undefined} className={i === breadcrumb.length - 1 ? 'text-ink-2' : undefined}>
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-1">
          {back && (
            <button
              type="button"
              onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
              aria-label={t('ui.back')}
              className="-ml-2 mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-ink-2 hover:bg-sunken hover:text-ink md:hidden"
            >
              <ChevronLeft size={22} strokeWidth={1.75} aria-hidden />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-h1-sm md:text-h1 text-ink">{title}</h1>
            {subtitle && <p className="mt-1 text-small text-ink-2">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {tabs}
    </header>
  )
})
