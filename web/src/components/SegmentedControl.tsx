import { forwardRef, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SegmentedOption<V extends string = string> {
  value: V
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
  /** aria-label when `label` is an icon only */
  ariaLabel?: string
}

export interface SegmentedControlProps<V extends string = string> extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  options: SegmentedOption<V>[]
  value: V
  onChange?: (value: V) => void
  size?: 'sm' | 'md'
  fullWidth?: boolean
  /** Accessible group name */
  label?: string
}

function SegmentedControlInner<V extends string>(
  { options, value, onChange, size = 'md', fullWidth, label, className, ...rest }: SegmentedControlProps<V>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const id = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const root = listRef.current
    if (!root) return
    const measure = () => {
      const el = root.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`)
      if (!el) return setThumb(null)
      setThumb({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [value, options.length])

  const onKey = (e: React.KeyboardEvent) => {
    const enabled = options.filter((o) => !o.disabled)
    const i = enabled.findIndex((o) => o.value === value)
    let next = i
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % enabled.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + enabled.length) % enabled.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = enabled.length - 1
    else return
    e.preventDefault()
    const opt = enabled[next]
    if (opt) {
      onChange?.(opt.value)
      listRef.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(opt.value)}"]`)?.focus()
    }
  }

  return (
    <div
      ref={(el) => {
        ;(listRef as React.MutableRefObject<HTMLDivElement | null>).current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      className={cn('relative inline-flex rounded-ctl bg-sunken p-0.5', fullWidth && 'flex w-full', className)}
      {...rest}
    >
      {thumb && (
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 rounded-sm bg-surface shadow-sm transition-[left,width] duration-token-base ease-out"
          style={{ left: thumb.left, width: thumb.width }}
        />
      )}
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.ariaLabel}
            tabIndex={selected ? 0 : -1}
            disabled={o.disabled}
            data-value={o.value}
            data-state={selected ? 'checked' : 'unchecked'}
            id={`${id}-${o.value}`}
            onClick={() => onChange?.(o.value)}
            className={cn(
              'relative z-[1] inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium transition-colors duration-token-fast',
              size === 'sm' ? 'h-7 px-2.5 text-caption' : 'h-8 px-3 text-small',
              selected ? 'text-ink' : 'text-ink-2 hover:text-ink',
              fullWidth && 'flex-1',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {o.icon && (
              <span className="inline-flex [&>svg]:size-4" aria-hidden>
                {o.icon}
              </span>
            )}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** DESIGN.md §5 SegmentedControl: `role=radiogroup`, sliding thumb; used for 地图/列表, 周/月, zh/EN. */
export const SegmentedControl = forwardRef(SegmentedControlInner) as <V extends string = string>(
  props: SegmentedControlProps<V> & { ref?: React.ForwardedRef<HTMLDivElement> },
) => ReactNode
