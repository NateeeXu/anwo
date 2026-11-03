import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useLocale, useT } from '@/lib/i18n'
import { Card } from './Card'

export interface StatTileProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode
  value: number
  delta?: { value: number; direction: 'up' | 'down' | 'flat' }
  /** Small series for the 56×20 sparkline */
  spark?: number[]
  hint?: ReactNode
  format?: 'number' | 'money' | 'percent'
  selected?: boolean
  /** Treat "down" as good (e.g. report count) */
  invertDelta?: boolean
}

function Spark({ data, selected }: { data: number[]; selected?: boolean }) {
  const w = 56
  const h = 20
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = max - min || 1
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${h - ((v - min) / span) * (h - 2) - 1}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className={selected ? 'text-accent' : 'text-ink-3'}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** DESIGN.md §5 StatTile (admin): caption label, price-lg tabular value, delta, sparkline. */
export const StatTile = forwardRef<HTMLDivElement, StatTileProps>(function StatTile(
  { label, value, delta, spark, hint, format = 'number', selected, invertDelta, className, ...rest },
  ref,
) {
  const t = useT()
  const { formatMoney, formatNumber, formatPercent } = useLocale()
  const text = format === 'money' ? formatMoney(value) : format === 'percent' ? formatPercent(value, 1) : formatNumber(value)
  const good = delta ? (delta.direction === 'up') !== !!invertDelta : true
  const DeltaIcon = delta?.direction === 'up' ? ArrowUpRight : delta?.direction === 'down' ? ArrowDownRight : Minus
  return (
    <Card ref={ref as never} variant={selected ? 'outline-accent' : 'default'} padding="md" className={cn('flex flex-col gap-2', className)} data-state={selected ? 'selected' : undefined} {...rest}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-caption text-ink-2">{label}</span>
        {spark && spark.length > 1 && <Spark data={spark} selected={selected} />}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-price-lg text-ink tabular-nums">{text}</span>
        {delta && (
          <span className={cn('inline-flex items-center gap-0.5 text-small tabular-nums', delta.direction === 'flat' ? 'text-ink-3' : good ? 'text-success' : 'text-danger')}>
            <DeltaIcon size={14} strokeWidth={2} aria-hidden />
            <span className="sr-only">{t(delta.direction === 'up' ? 'ui.up' : delta.direction === 'down' ? 'ui.down' : 'ui.flat')} </span>
            {format === 'percent' ? formatPercent(Math.abs(delta.value), 1) : formatNumber(Math.abs(delta.value), { maximumFractionDigits: 1 })}
            {format !== 'percent' && '%'}
          </span>
        )}
      </div>
      {hint && <span className="text-small text-ink-3">{hint}</span>}
    </Card>
  )
})
