import { forwardRef, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { SegmentedControl } from './SegmentedControl'

export interface TabItem<K extends string = string> {
  key: K
  label: ReactNode
  count?: number
  icon?: ReactNode
  disabled?: boolean
}

export interface TabsProps<K extends string = string> extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  items: TabItem<K>[]
  value: K
  onChange?: (key: K) => void
  variant?: 'underline' | 'pill'
  /** Horizontal scroll with hidden scrollbar for long tab rows */
  scrollable?: boolean
  label?: string
}

function TabsInner<K extends string>(
  { items, value, onChange, variant = 'underline', scrollable, label, className, ...rest }: TabsProps<K>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const id = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const [ink, setInk] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (variant !== 'underline') return
    const root = listRef.current
    if (!root) return
    const measure = () => {
      const el = root.querySelector<HTMLElement>(`[data-key="${CSS.escape(value)}"]`)
      if (!el) return setInk(null)
      setInk({ left: el.offsetLeft, width: el.offsetWidth })
      el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [value, items.length, variant])

  if (variant === 'pill') {
    return (
      <div ref={ref} className={className} {...rest}>
        <SegmentedControl
          label={label}
          options={items.map((i) => ({ value: i.key, label: i.count != null ? <>{i.label} <span className="text-ink-3 tabular-nums">{i.count}</span></> : i.label, icon: i.icon, disabled: i.disabled }))}
          value={value}
          onChange={(v) => onChange?.(v)}
        />
      </div>
    )
  }

  const onKey = (e: React.KeyboardEvent) => {
    const enabled = items.filter((i) => !i.disabled)
    const i = enabled.findIndex((x) => x.key === value)
    let next = i
    if (e.key === 'ArrowRight') next = (i + 1) % enabled.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + enabled.length) % enabled.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = enabled.length - 1
    else return
    e.preventDefault()
    const item = enabled[next]
    if (item) {
      onChange?.(item.key)
      listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(item.key)}"]`)?.focus()
    }
  }

  return (
    <div ref={ref} className={cn('relative border-b border-line', scrollable && 'fade-x', className)} {...rest}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKey}
        className={cn('relative flex h-11 items-stretch gap-1', scrollable && 'no-scrollbar overflow-x-auto')}
      >
        {items.map((it) => {
          const selected = it.key === value
          return (
            <button
              key={it.key}
              type="button"
              role="tab"
              id={`${id}-tab-${it.key}`}
              aria-selected={selected}
              aria-controls={`${id}-panel-${it.key}`}
              tabIndex={selected ? 0 : -1}
              disabled={it.disabled}
              data-key={it.key}
              data-state={selected ? 'active' : 'inactive'}
              onClick={() => onChange?.(it.key)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xs px-3 text-body font-medium transition-colors duration-token-fast',
                selected ? 'text-ink' : 'text-ink-2 hover:text-ink',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {it.icon && (
                <span className="inline-flex [&>svg]:size-4" aria-hidden>
                  {it.icon}
                </span>
              )}
              {it.label}
              {it.count != null && <span className={cn('text-small tabular-nums', selected ? 'text-ink-2' : 'text-ink-3')}>{it.count}</span>}
            </button>
          )
        })}
        {ink && (
          <span
            aria-hidden
            className="absolute bottom-0 h-0.5 rounded-pill bg-accent transition-[left,width] duration-token-base ease-out"
            style={{ left: ink.left, width: ink.width }}
          />
        )}
      </div>
    </div>
  )
}

/** DESIGN.md §5 Tabs: underline (sliding accent ink) or pill (SegmentedControl look). `role=tablist`, arrow keys. */
export const Tabs = forwardRef(TabsInner) as <K extends string = string>(props: TabsProps<K> & { ref?: React.ForwardedRef<HTMLDivElement> }) => ReactNode

/** Pair with Tabs: `<TabPanel tabsId=... key=...>` is optional sugar; most pages render content directly. */
export function TabPanel({ active, children, className }: { active: boolean; children: ReactNode; className?: string }) {
  if (!active) return null
  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  )
}
