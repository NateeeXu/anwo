import { forwardRef, useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAnchorPosition, useEscape, useIsMobile, useOnClickOutside, mergeRefs } from '@/lib/hooks'
import { useLocale, useT, type Locale, toDateInput } from '@/lib/i18n'
import { Button } from './Button'
import { Chip } from './Chip'
import { Field } from './Field'
import { inputBoxClasses } from './Input'
import { Portal } from './Portal'
import { Sheet } from './Sheet'

export interface DateRangeValue {
  /** `YYYY-MM-DD` or null */
  start: string | null
  end: string | null
}
export interface DateRangePreset {
  label: ReactNode
  start: string
  end: string
  key?: string
}

export interface DateRangeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: DateRangeValue
  onChange: (v: DateRangeValue) => void
  /** `YYYY-MM-DD` */
  min?: string
  max?: string
  presets?: DateRangePreset[]
  locale?: Locale
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  disabled?: boolean
  /** Number of months shown side by side on desktop (default 2) */
  months?: 1 | 2
}

const parse = (s: string | null | undefined): Date | null => {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)

function Month({
  month,
  value,
  hover,
  min,
  max,
  weekStart,
  locale,
  onPick,
  onHover,
  focusDate,
  setFocusDate,
}: {
  month: Date
  value: DateRangeValue
  hover: Date | null
  min?: Date | null
  max?: Date | null
  weekStart: 0 | 1
  locale: Locale
  onPick: (d: Date) => void
  onHover: (d: Date | null) => void
  focusDate: Date
  setFocusDate: (d: Date) => void
}) {
  const t = useT()
  const intl = locale === 'zh-CN' ? 'zh-CN' : 'en-US'
  const title = new Intl.DateTimeFormat(intl, { year: 'numeric', month: 'long' }).format(month)
  const weekdays = useMemo(() => {
    const base = new Date(2024, 0, 7 + weekStart) // Sunday 2024-01-07
    return Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(intl, { weekday: 'narrow' }).format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)))
  }, [intl, weekStart])
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const lead = (first.getDay() - weekStart + 7) % 7
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const start = parse(value.start)
  const end = parse(value.end)
  const rangeEnd = end ?? (start && hover && hover > start ? hover : null)
  const today = new Date()
  const gridRef = useRef<HTMLDivElement>(null)

  const onKey = (e: React.KeyboardEvent, d: Date) => {
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in delta) {
      e.preventDefault()
      const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta[e.key])
      setFocusDate(n)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick(d)
    }
  }
  useEffect(() => {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-date="${toDateInput(focusDate)}"]`)
    if (el && document.activeElement && gridRef.current?.contains(document.activeElement)) el.focus()
  }, [focusDate])

  return (
    <div className="w-[280px] select-none">
      <div className="mb-2 text-center text-body font-semibold text-ink">{title}</div>
      <div className="grid grid-cols-7 text-center text-caption text-ink-3" aria-hidden>
        {weekdays.map((w, i) => (
          <div key={i} className="h-7 leading-7">
            {w}
          </div>
        ))}
      </div>
      <div ref={gridRef} role="grid" className="grid grid-cols-7" onMouseLeave={() => onHover(null)}>
        {Array.from({ length: lead }).map((_, i) => (
          <div key={`l${i}`} />
        ))}
        {Array.from({ length: days }).map((_, i) => {
          const d = new Date(month.getFullYear(), month.getMonth(), i + 1)
          const disabled = (min && d < min) || (max && d > max)
          const isStart = !!start && same(d, start)
          const isEnd = !!rangeEnd && same(d, rangeEnd)
          const inRange = !!start && !!rangeEnd && d > start && d < rangeEnd
          const isFocus = same(d, focusDate)
          return (
            <div key={i} className={cn('relative flex h-9 items-center justify-center', inRange && 'bg-accent-soft', isStart && rangeEnd && 'rounded-l-pill bg-accent-soft', isEnd && start && 'rounded-r-pill bg-accent-soft')}>
              <button
                type="button"
                role="gridcell"
                tabIndex={isFocus ? 0 : -1}
                disabled={!!disabled}
                aria-selected={isStart || isEnd || undefined}
                aria-label={new Intl.DateTimeFormat(intl, { dateStyle: 'long' }).format(d)}
                data-date={toDateInput(d)}
                onClick={() => onPick(d)}
                onMouseEnter={() => onHover(d)}
                onKeyDown={(e) => onKey(e, d)}
                className={cn(
                  'relative z-[1] flex size-9 items-center justify-center rounded-pill text-small tabular-nums transition-colors duration-token-fast',
                  isStart || isEnd ? 'bg-accent font-semibold text-on-accent' : 'text-ink hover:bg-sunken',
                  same(d, today) && !(isStart || isEnd) && 'font-semibold text-accent-text',
                  disabled && 'cursor-not-allowed text-ink-4 hover:bg-transparent',
                )}
              >
                {i + 1}
                {same(d, today) && <span className="sr-only">{t('ui.today')}</span>}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** DESIGN.md §5 DateRange: two inputs + popover calendar (desktop) / sheet (mobile); accent-soft range fill. */
export const DateRange = forwardRef<HTMLDivElement, DateRangeProps>(function DateRange(
  { value, onChange, min, max, presets, locale: localeProp, label, hint, error, disabled, months = 2, className, ...rest },
  ref,
) {
  const t = useT()
  const { locale: appLocale, formatDate } = useLocale()
  const locale = localeProp ?? appLocale
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<Date | null>(null)
  const [view, setView] = useState<Date>(() => parse(value.start) ?? new Date())
  const [focusDate, setFocusDate] = useState<Date>(() => parse(value.start) ?? new Date())
  const [draft, setDraft] = useState<DateRangeValue>(value)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const pos = useAnchorPosition(triggerRef, popRef, open && !isMobile, { side: 'bottom', align: 'start', gap: 6 })
  const weekStart: 0 | 1 = locale === 'zh-CN' ? 1 : 0
  const minD = parse(min)
  const maxD = parse(max)

  useOnClickOutside([triggerRef, popRef], () => setOpen(false), open && !isMobile)
  useEscape(() => setOpen(false), open && !isMobile)
  useEffect(() => {
    if (open) {
      setDraft(value)
      setView(addMonths(parse(value.start) ?? new Date(), 0))
      setFocusDate(parse(value.start) ?? new Date())
    }
  }, [open, value])
  useEffect(() => {
    if (focusDate.getMonth() !== view.getMonth() || focusDate.getFullYear() !== view.getFullYear()) {
      const diff = (focusDate.getFullYear() - view.getFullYear()) * 12 + focusDate.getMonth() - view.getMonth()
      if (diff < 0 || diff >= (isMobile ? 1 : months)) setView(addMonths(focusDate, 0))
    }
  }, [focusDate, view, months, isMobile])

  const commit = (v: DateRangeValue, close = true) => {
    onChange(v)
    if (close) setOpen(false)
  }

  const pick = (d: Date) => {
    const iso = toDateInput(d)
    const cur = isMobile ? draft : value
    const next: DateRangeValue =
      !cur.start || (cur.start && cur.end) ? { start: iso, end: null } : parse(cur.start)! > d ? { start: iso, end: cur.start } : { start: cur.start, end: iso }
    setFocusDate(d)
    if (isMobile) setDraft(next)
    else commit(next, !!next.end)
  }

  const calendar = (mobile: boolean) => {
    const v = mobile ? draft : value
    const n = mobile ? 1 : months
    return (
      <div className="flex flex-col gap-3">
        {presets && presets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {presets.map((p, i) => {
              const sel = v.start === p.start && v.end === p.end
              return (
                <button key={p.key ?? i} type="button" onClick={() => (mobile ? setDraft({ start: p.start, end: p.end }) : commit({ start: p.start, end: p.end }))} aria-pressed={sel}>
                  <Chip size="sm" variant={sel ? 'inverse' : 'default'} className="cursor-pointer hover:bg-line">
                    {p.label}
                  </Chip>
                </button>
              )
            })}
          </div>
        )}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" iconOnly aria-label={t('ui.prevMonth')} onClick={() => setView(addMonths(view, -1))}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="sm" iconOnly aria-label={t('ui.nextMonth')} onClick={() => setView(addMonths(view, 1))}>
            <ChevronRight />
          </Button>
        </div>
        <div className={cn('-mt-10 flex gap-6', mobile && 'justify-center')}>
          {Array.from({ length: n }).map((_, i) => (
            <Month
              key={i}
              month={addMonths(view, i)}
              value={v}
              hover={hover}
              min={minD}
              max={maxD}
              weekStart={weekStart}
              locale={locale}
              onPick={pick}
              onHover={setHover}
              focusDate={focusDate}
              setFocusDate={setFocusDate}
            />
          ))}
        </div>
      </div>
    )
  }

  const display = (s: string | null, placeholderKey: string) => (s ? formatDate(s, 'short') : <span className="text-ink-3">{t(placeholderKey)}</span>)

  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <div
        ref={mergeRefs(ref, triggerRef)}
        className={cn(inputBoxClasses({ error: !!error, disabled }), 'cursor-pointer gap-0 px-0')}
        data-state={open ? 'open' : 'closed'}
        {...rest}
      >
        <button type="button" disabled={disabled} onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open} aria-label={typeof label === 'string' ? label : t('ui.pickDates')} className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-body focus-visible:outline-none">
          <CalendarDays size={16} strokeWidth={1.75} className="shrink-0 text-ink-3" aria-hidden />
          <span className="truncate">{display(value.start, 'ui.dateStart')}</span>
          <span className="text-ink-3" aria-hidden>
            –
          </span>
          <span className="truncate">{display(value.end, 'ui.dateEnd')}</span>
        </button>
        {(value.start || value.end) && !disabled && (
          <button type="button" onClick={() => commit({ start: null, end: null }, false)} aria-label={t('ui.clear')} className="mr-2 inline-flex size-6 shrink-0 items-center justify-center rounded-pill text-ink-3 hover:bg-sunken hover:text-ink">
            ×
          </button>
        )}
      </div>
      {open && isMobile && (
        <Sheet
          open
          onClose={() => setOpen(false)}
          title={label ?? t('ui.pickDates')}
          footer={
            <div className="flex gap-2">
              <Button variant="secondary" fullWidth onClick={() => setDraft({ start: null, end: null })}>
                {t('ui.clear')}
              </Button>
              <Button fullWidth onClick={() => commit(draft)}>
                {t('ui.apply')}
              </Button>
            </div>
          }
        >
          {calendar(true)}
        </Sheet>
      )}
      {open && !isMobile && (
        <Portal>
          <div
            ref={popRef}
            role="dialog"
            aria-label={typeof label === 'string' ? label : t('ui.pickDates')}
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className="z-layer-popover rounded-card border border-line bg-surface p-4 shadow-md animate-fade-in"
          >
            {calendar(false)}
          </div>
        </Portal>
      )}
    </Field>
  )
})
