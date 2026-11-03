import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useAnchorPosition, useEscape, useIsMobile, useOnClickOutside, type Align } from '@/lib/hooks'
import { Portal } from './Portal'
import { Sheet } from './Sheet'

export interface MenuItem {
  label: ReactNode
  icon?: ReactNode
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onSelect?: () => void
  /** Optional id for tests */
  key?: string
}
export type MenuEntry = MenuItem | 'separator'

export interface DropdownMenuProps {
  /** Element that opens the menu (receives onClick, aria-haspopup, aria-expanded, ref). */
  trigger: ReactElement
  items: MenuEntry[]
  align?: Align
  /** Accessible menu name (also the Sheet title on mobile) */
  label?: string
  /** Controlled open state */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

/** DESIGN.md §5 DropdownMenu: shadow-md popover with `role=menu`, arrows + typeahead; Sheet on mobile. */
export function DropdownMenu({ trigger, items, align = 'start', label, open: openProp, onOpenChange, className }: DropdownMenuProps) {
  const id = useId()
  const isMobile = useIsMobile()
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setOpenState(v)
    onOpenChange?.(v)
  }
  const anchorRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(-1)
  const typeahead = useRef({ buffer: '', at: 0 })
  const pos = useAnchorPosition(anchorRef, menuRef, open && !isMobile, { side: 'bottom', align, gap: 4 })

  useOnClickOutside([anchorRef, menuRef], () => setOpen(false), open && !isMobile)
  useEscape(() => {
    setOpen(false)
    anchorRef.current?.focus()
  }, open && !isMobile)

  const enabledIdx = items.map((it, i) => (it !== 'separator' && !it.disabled ? i : -1)).filter((i) => i >= 0)

  useEffect(() => {
    if (!open) {
      setActive(-1)
      return
    }
    const first = enabledIdx[0] ?? -1
    setActive(first)
    const raf = requestAnimationFrame(() => menuRef.current?.focus())
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const select = (it: MenuItem) => {
    if (it.disabled) return
    setOpen(false)
    it.onSelect?.()
    anchorRef.current?.focus()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!enabledIdx.length) return
    const cur = enabledIdx.indexOf(active)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(enabledIdx[(cur + 1) % enabledIdx.length])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(enabledIdx[(cur - 1 + enabledIdx.length) % enabledIdx.length])
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(enabledIdx[0])
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(enabledIdx[enabledIdx.length - 1])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const it = items[active]
      if (it && it !== 'separator') select(it)
    } else if (e.key === 'Tab') {
      setOpen(false)
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      const now = Date.now()
      const ta = typeahead.current
      ta.buffer = now - ta.at < 600 ? ta.buffer + e.key.toLowerCase() : e.key.toLowerCase()
      ta.at = now
      const match = enabledIdx.find((i) => {
        const it = items[i] as MenuItem
        return String(typeof it.label === 'string' ? it.label : '')
          .toLowerCase()
          .startsWith(ta.buffer)
      })
      if (match != null) setActive(match)
    }
  }

  const triggerEl = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        ref: (el: HTMLElement | null) => {
          anchorRef.current = el
          const r = (trigger as unknown as { ref?: unknown }).ref
          if (typeof r === 'function') r(el)
          else if (r && typeof r === 'object') (r as { current: unknown }).current = el
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? `${id}-menu` : undefined,
        onClick: (e: unknown) => {
          ;((trigger as ReactElement<Record<string, unknown>>).props.onClick as ((e: unknown) => void) | undefined)?.(e)
          setOpen(!open)
        },
        onKeyDown: (e: React.KeyboardEvent) => {
          ;((trigger as ReactElement<Record<string, unknown>>).props.onKeyDown as ((e: unknown) => void) | undefined)?.(e)
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        },
      })
    : trigger

  const list = (mobile: boolean) =>
    items.map((it, i) =>
      it === 'separator' ? (
        <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-line" />
      ) : (
        <button
          key={it.key ?? i}
          type="button"
          role="menuitem"
          disabled={it.disabled}
          tabIndex={-1}
          data-active={!mobile && active === i ? '' : undefined}
          onMouseEnter={() => !mobile && setActive(i)}
          onClick={() => select(it)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-body transition-colors duration-token-fast',
            mobile ? 'h-12' : 'h-9',
            it.danger ? 'text-danger' : 'text-ink',
            'data-[active]:bg-sunken hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {it.icon && (
            <span className={cn('inline-flex shrink-0 [&>svg]:size-4', it.danger ? 'text-danger' : 'text-ink-2')} aria-hidden>
              {it.icon}
            </span>
          )}
          <span className="flex-1 truncate">{it.label}</span>
          {it.shortcut && <span className="text-caption text-ink-3">{it.shortcut}</span>}
        </button>
      ),
    )

  return (
    <>
      {triggerEl}
      {open && isMobile && (
        <Sheet open onClose={() => setOpen(false)} title={label} bodyClassName="px-2 pb-2">
          <div role="menu" aria-label={label} className="flex flex-col">
            {list(true)}
          </div>
        </Sheet>
      )}
      {open && !isMobile && (
        <Portal>
          <div
            ref={menuRef}
            id={`${id}-menu`}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onKey}
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, maxHeight: pos?.maxHeight }}
            className={cn('z-layer-dropdown min-w-[200px] overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-md outline-none animate-fade-in', className)}
          >
            {list(false)}
          </div>
        </Portal>
      )}
    </>
  )
}
