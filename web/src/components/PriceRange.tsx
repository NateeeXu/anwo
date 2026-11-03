import { forwardRef, useEffect, useId, useState, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'

export interface PriceRangeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** [min, max] in cents */
  value: [number, number]
  onChange: (v: [number, number]) => void
  /** [min, max] in cents */
  bounds: [number, number]
  /** cents (default 5000 = $50) */
  step?: number
  /** 24 buckets of counts across `bounds` */
  histogram?: number[]
  unit?: '/mo' | ''
  label?: string
  disabled?: boolean
}

/** DESIGN.md §5 PriceRange: dual slider, accent range, optional histogram, two `$` inputs. */
export const PriceRange = forwardRef<HTMLDivElement, PriceRangeProps>(function PriceRange(
  { value, onChange, bounds, step = 5000, histogram, unit = '/mo', label, disabled, className, ...rest },
  ref,
) {
  const t = useT()
  const id = useId()
  const [lo, hi] = bounds
  const span = Math.max(1, hi - lo)
  const [minV, maxV] = [Math.max(lo, Math.min(value[0], value[1])), Math.min(hi, Math.max(value[0], value[1]))]
  const [minText, setMinText] = useState(String(Math.round(minV / 100)))
  const [maxText, setMaxText] = useState(String(Math.round(maxV / 100)))
  useEffect(() => setMinText(String(Math.round(minV / 100))), [minV])
  useEffect(() => setMaxText(String(Math.round(maxV / 100))), [maxV])

  const pct = (v: number) => ((v - lo) / span) * 100
  const clamp = (v: number) => Math.round(Math.max(lo, Math.min(hi, v)) / step) * step
  const setMin = (v: number) => onChange([Math.min(clamp(v), maxV), maxV])
  const setMax = (v: number) => onChange([minV, Math.max(clamp(v), minV)])

  const commitText = (which: 'min' | 'max') => {
    const n = Number((which === 'min' ? minText : maxText).replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(n)) return
    if (which === 'min') setMin(n * 100)
    else setMax(n * 100)
  }

  const bars = histogram && histogram.length > 0 ? histogram : null
  const peak = bars ? Math.max(1, ...bars) : 1
  const thumb =
    'pointer-events-none absolute inset-x-0 top-1/2 h-5 w-full -translate-y-1/2 appearance-none bg-transparent outline-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-pill [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-pill [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-accent [&::-moz-range-thumb]:bg-surface [&::-moz-range-thumb]:shadow-sm focus-visible:[&::-webkit-slider-thumb]:outline-2 focus-visible:[&::-webkit-slider-thumb]:outline-offset-2 focus-visible:[&::-webkit-slider-thumb]:outline-focus disabled:opacity-50'

  return (
    <div ref={ref} className={cn('flex flex-col gap-3', disabled && 'opacity-50', className)} role="group" aria-label={label} {...rest}>
      {bars && (
        <div className="flex h-10 items-end gap-px" aria-hidden>
          {bars.map((b, i) => {
            const bucketLo = lo + (i / bars.length) * span
            const bucketHi = lo + ((i + 1) / bars.length) * span
            const inRange = bucketHi > minV && bucketLo < maxV
            return <div key={i} className={cn('flex-1 rounded-t-xs', inRange ? 'bg-accent' : 'bg-line-strong')} style={{ height: `${Math.max(4, (b / peak) * 100)}%` }} />
          })}
        </div>
      )}
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-pill bg-line" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-pill bg-accent" style={{ left: `${pct(minV)}%`, right: `${100 - pct(maxV)}%` }} />
        <input
          id={`${id}-min`}
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={minV}
          disabled={disabled}
          aria-label={t('ui.priceMin')}
          aria-valuetext={`$${Math.round(minV / 100)}`}
          onChange={(e) => setMin(Number(e.target.value))}
          className={cn(thumb, minV > hi - step && 'z-[2]')}
        />
        <input
          id={`${id}-max`}
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={maxV}
          disabled={disabled}
          aria-label={t('ui.priceMax')}
          aria-valuetext={`$${Math.round(maxV / 100)}`}
          onChange={(e) => setMax(Number(e.target.value))}
          className={thumb}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-1 rounded-ctl border border-line-strong bg-surface px-2.5 text-small focus-within:border-accent">
          <span className="text-ink-3" aria-hidden>
            $
          </span>
          <input
            inputMode="numeric"
            aria-label={t('ui.priceMin')}
            value={minText}
            disabled={disabled}
            onChange={(e) => setMinText(e.target.value)}
            onBlur={() => commitText('min')}
            onKeyDown={(e) => e.key === 'Enter' && commitText('min')}
            className="w-full min-w-0 bg-transparent tabular-nums outline-none"
          />
          {unit && <span className="text-caption text-ink-3">{unit}</span>}
        </label>
        <span className="text-ink-3" aria-hidden>
          –
        </span>
        <label className="flex h-9 min-w-0 flex-1 items-center gap-1 rounded-ctl border border-line-strong bg-surface px-2.5 text-small focus-within:border-accent">
          <span className="text-ink-3" aria-hidden>
            $
          </span>
          <input
            inputMode="numeric"
            aria-label={t('ui.priceMax')}
            value={maxText}
            disabled={disabled}
            onChange={(e) => setMaxText(e.target.value)}
            onBlur={() => commitText('max')}
            onKeyDown={(e) => e.key === 'Enter' && commitText('max')}
            className="w-full min-w-0 bg-transparent tabular-nums outline-none"
          />
          {unit && <span className="text-caption text-ink-3">{unit}</span>}
        </label>
      </div>
    </div>
  )
})
