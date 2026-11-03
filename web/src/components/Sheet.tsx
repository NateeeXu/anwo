import { forwardRef, useId, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useEscape, useFocusTrap, useLockBody, mergeRefs } from '@/lib/hooks'
import { useT } from '@/lib/i18n'
import { Portal } from './Portal'

export interface SheetProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  /** `half` = content height up to 88dvh; `full` = 88dvh always */
  snap?: 'half' | 'full'
  /** Show the 36×4 drag handle (default true) */
  handle?: boolean
  footer?: ReactNode
  /** Close on scrim click / Esc (default true) */
  dismissible?: boolean
  initialFocus?: RefObject<HTMLElement | null>
  /** Hide the × button */
  hideClose?: boolean
  /** Remove body padding (lists that go edge to edge) */
  bodyClassName?: string
}

/** DESIGN.md §5 Sheet: bottom sheet, rounded-t-card, drag-to-dismiss, safe-area padding. */
export const Sheet = forwardRef<HTMLDivElement, SheetProps>(function Sheet(
  { open, onClose, title, description, snap = 'half', handle = true, footer, dismissible = true, initialFocus, hideClose, bodyClassName, className, children, ...rest },
  ref,
) {
  const t = useT()
  const id = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [dragY, setDragY] = useState(0)
  const drag = useRef<{ startY: number; active: boolean }>({ startY: 0, active: false })

  useLockBody(open)
  useFocusTrap(panelRef, open, { initialFocus: initialFocus ?? undefined })
  useEscape(() => dismissible && onClose(), open)

  if (!open) return null

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, active: true }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    setDragY(Math.max(0, e.clientY - drag.current.startY))
  }
  const onPointerUp = () => {
    if (!drag.current.active) return
    drag.current.active = false
    if (dragY > 96 && dismissible) onClose()
    setDragY(0)
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-layer-modal flex items-end justify-center" role="presentation">
        <div className="absolute inset-0 bg-overlay animate-fade-in" onClick={() => dismissible && onClose()} aria-hidden />
        <div
          ref={mergeRefs(ref, panelRef)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? `${id}-title` : undefined}
          aria-describedby={description ? `${id}-desc` : undefined}
          tabIndex={-1}
          data-state="open"
          style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragY ? 'none' : undefined }}
          className={cn(
            'relative flex w-full max-w-[640px] flex-col rounded-t-card bg-surface shadow-lg outline-none animate-sheet-up',
            snap === 'full' ? 'h-[88dvh]' : 'max-h-[88dvh]',
            className,
          )}
          {...rest}
        >
          {handle && (
            <div
              className="flex shrink-0 cursor-grab touch-none items-center justify-center pt-2 pb-1 active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              aria-hidden
            >
              <span className="h-1 w-9 rounded-pill bg-line-strong" />
            </div>
          )}
          {(title || !hideClose) && (
            <div
              className={cn('flex shrink-0 items-start justify-between gap-3 px-4', handle ? 'pt-1 pb-3' : 'pt-4 pb-3')}
              onPointerDown={handle ? onPointerDown : undefined}
              onPointerMove={handle ? onPointerMove : undefined}
              onPointerUp={handle ? onPointerUp : undefined}
              onPointerCancel={handle ? onPointerUp : undefined}
            >
              <div className="min-w-0 flex-1 touch-none">
                {title && (
                  <h2 id={`${id}-title`} className="text-h3 text-ink">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={`${id}-desc`} className="mt-0.5 text-small text-ink-2">
                    {description}
                  </p>
                )}
              </div>
              {!hideClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('ui.close')}
                  className="-mr-1 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-ink-2 hover:bg-sunken hover:text-ink"
                >
                  <X size={18} strokeWidth={1.75} aria-hidden />
                </button>
              )}
            </div>
          )}
          <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4', !footer && 'pb-safe', bodyClassName)}>{children}</div>
          {footer && <div className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">{footer}</div>}
        </div>
      </div>
    </Portal>
  )
})
