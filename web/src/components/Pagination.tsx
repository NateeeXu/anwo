import { forwardRef, useEffect, useRef, useState, type HTMLAttributes } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useIsMobile } from '@/lib/hooks'
import { useT } from '@/lib/i18n'
import { Button } from './Button'

export interface PaginationProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  /** `numbers` (desktop default) | `loadMore` (mobile default) */
  variant?: 'numbers' | 'loadMore'
  loading?: boolean
}

function range(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set<number>([1, pages, page - 1, page, page + 1])
  if (page <= 3) [2, 3, 4].forEach((n) => set.add(n))
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => set.add(n))
  const nums = Array.from(set).filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) out.push('…')
    out.push(nums[i])
  }
  return out
}

/** DESIGN.md §5 Pagination: ghost number buttons (current = inverse) on desktop, 「加载更多」 on mobile; announces page changes. */
export const Pagination = forwardRef<HTMLElement, PaginationProps>(function Pagination(
  { page, pageSize, total, onChange, variant, loading, className, ...rest },
  ref,
) {
  const t = useT()
  const isMobile = useIsMobile()
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  const mode = variant ?? (isMobile ? 'loadMore' : 'numbers')
  const [announce, setAnnounce] = useState('')
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setAnnounce(t('ui.pageChanged', { page }))
  }, [page, t])

  if (pages <= 1 && mode === 'numbers') return null

  if (mode === 'loadMore') {
    if (page >= pages) return null
    return (
      <nav ref={ref} aria-label={t('ui.page', { page })} className={cn('flex justify-center py-2', className)} {...rest}>
        <Button variant="secondary" size="md" loading={loading} onClick={() => onChange(page + 1)}>
          {t('ui.loadMore')}
        </Button>
        <span className="sr-only" aria-live="polite">
          {announce}
        </span>
      </nav>
    )
  }

  const btn = 'inline-flex h-9 min-w-9 items-center justify-center rounded-ctl px-2 text-small font-medium tabular-nums transition-colors duration-token-fast disabled:opacity-50 disabled:cursor-not-allowed'
  return (
    <nav ref={ref} aria-label={t('ui.pageOf', { page, pages })} className={cn('flex items-center justify-center gap-1', className)} {...rest}>
      <button type="button" className={cn(btn, 'text-ink-2 hover:bg-sunken hover:text-ink')} disabled={page <= 1 || loading} onClick={() => onChange(page - 1)} aria-label={t('ui.previous')}>
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
      </button>
      {range(page, pages).map((n, i) =>
        n === '…' ? (
          <span key={`e${i}`} className="inline-flex h-9 min-w-9 items-center justify-center text-ink-3" aria-hidden>
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            aria-current={n === page ? 'page' : undefined}
            aria-label={t('ui.page', { page: n })}
            disabled={loading}
            onClick={() => onChange(n)}
            className={cn(btn, n === page ? 'bg-inverse text-ink-inverse' : 'text-ink-2 hover:bg-sunken hover:text-ink')}
          >
            {n}
          </button>
        ),
      )}
      <button type="button" className={cn(btn, 'text-ink-2 hover:bg-sunken hover:text-ink')} disabled={page >= pages || loading} onClick={() => onChange(page + 1)} aria-label={t('ui.next')}>
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </nav>
  )
})
