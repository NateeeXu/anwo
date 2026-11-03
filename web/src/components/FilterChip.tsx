import { forwardRef, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAnchorPosition, useEscape, useIsMobile, useOnClickOutside, mergeRefs } from '@/lib/hooks'
import { Portal } from './Portal'
import { Sheet } from './Sheet'

export interface FilterChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  selected?: boolean
  count?: number
  icon?: ReactNode
  onClick?: () => void
  /** Popover content (desktop) / Sheet (mobile). When set, the chip shows a chevron and toggles the panel. */
  menu?: ReactNode | ((close: () => void) => ReactNode)
  /** Sheet title on mobile */
  menuTitle?: ReactNode
  size?: 'sm' | 'md'
}

/** DESIGN.md §5 FilterChip: toggle chip with `aria-pressed`; selected = inverse; optional popover menu. */
export const FilterChip = forwardRef<HTMLButtonElement, FilterChipProps>(function FilterChip(
  { selected, count, icon, onClick, menu, menuTitle, size = 'md', className, children, ...rest },
  ref,
) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const pos = useAnchorPosition(btnRef, popRef, open && !isMobile && !!menu, { side: 'bottom', align: 'start', gap: 6 })
  useOnClickOutside([btnRef, popRef], () => setOpen(false), open && !isMobile)
  useEscape(() => {
    setOpen(false)
    btnRef.current?.focus()
  }, open && !isMobile)
  const close = () => setOpen(false)
  const content = typeof menu === 'function' ? menu(close) : menu

  return (
    <>
      <button
        ref={mergeRefs(ref, btnRef)}
        type="button"
        aria-pressed={menu ? undefined : !!selected}
        aria-haspopup={menu ? 'dialog' : undefined}
        aria-expanded={menu ? open : undefined}
        data-state={selected ? 'selected' : 'idle'}
        onClick={() => {
          if (menu) setOpen(!open)
          else onClick?.()
        }}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border font-medium transition-[background-color,border-color,color] duration-token-base ease-out',
          size === 'sm' ? 'h-7 px-2.5 text-caption' : 'h-8 px-3 text-small',
          selected ? 'border-inverse bg-inverse text-ink-inverse' : 'border-line-strong bg-surface text-ink hover:bg-sunken',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...rest}
      >
        {icon && (
          <span className="inline-flex shrink-0 [&>svg]:size-3.5" aria-hidden>
            {icon}
          </span>
        )}
        {children}
        {count != null && count > 0 && (
          <span className={cn('inline-flex h-4 min-w-4 items-center justify-center rounded-pill px-1 text-[11px] tabular-nums', selected ? 'bg-ink-inverse/15' : 'bg-sunken text-ink-2')}>
            {count}
          </span>
        )}
        {menu && <ChevronDown size={14} strokeWidth={2} className={cn('shrink-0 transition-transform duration-token-base', open && 'rotate-180')} aria-hidden />}
      </button>
      {menu && open && isMobile && (
        <Sheet open onClose={close} title={menuTitle ?? children}>
          {content}
        </Sheet>
      )}
      {menu && open && !isMobile && (
        <Portal>
          <div
            ref={popRef}
            role="dialog"
            aria-label={typeof menuTitle === 'string' ? menuTitle : typeof children === 'string' ? children : undefined}
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, maxHeight: pos?.maxHeight }}
            className="z-layer-dropdown min-w-[240px] overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-md animate-fade-in"
          >
            {content}
          </div>
        </Portal>
      )}
    </>
  )
})
