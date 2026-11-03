import { forwardRef, useId, useRef, type HTMLAttributes, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useEscape, useFocusTrap, useIsMobile, useLockBody, mergeRefs } from '@/lib/hooks'
import { useT } from '@/lib/i18n'
import { Portal } from './Portal'
import { Sheet } from './Sheet'

export interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  /** 420 / 560 / 760 px */
  size?: 'sm' | 'md' | 'lg'
  footer?: ReactNode
  /** Close on scrim click / Esc (default true) */
  dismissible?: boolean
  initialFocus?: RefObject<HTMLElement | null>
  /** Hide the × button */
  hideClose?: boolean
  /** Always render as a centered modal, even below `md` */
  forceModal?: boolean
  /** Sheet snap when rendered as a sheet on mobile */
  sheetSnap?: 'half' | 'full'
  bodyClassName?: string
}

const W = { sm: 'max-w-[420px]', md: 'max-w-[560px]', lg: 'max-w-[760px]' }

/** DESIGN.md §5 Modal: centered dialog `rounded-card shadow-lg p-24 rise-in`; below `md` renders as a Sheet. */
export const Modal = forwardRef<HTMLDivElement, ModalProps>(function Modal(
  { open, onClose, title, description, size = 'md', footer, dismissible = true, initialFocus, hideClose, forceModal, sheetSnap, bodyClassName, className, children, ...rest },
  ref,
) {
  const t = useT()
  const id = useId()
  const isMobile = useIsMobile()
  const panelRef = useRef<HTMLDivElement>(null)
  const asSheet = isMobile && !forceModal

  useLockBody(open && !asSheet)
  useFocusTrap(panelRef, open && !asSheet, { initialFocus: initialFocus ?? undefined })
  useEscape(() => dismissible && onClose(), open && !asSheet)

  if (!open) return null
  if (asSheet) {
    return (
      <Sheet
        ref={ref}
        open={open}
        onClose={onClose}
        title={title}
        description={description}
        footer={footer}
        dismissible={dismissible}
        initialFocus={initialFocus}
        hideClose={hideClose}
        snap={sheetSnap}
        bodyClassName={bodyClassName}
        className={className}
      >
        {children}
      </Sheet>
    )
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-layer-modal flex items-center justify-center p-4" role="presentation">
        <div className="absolute inset-0 bg-overlay animate-fade-in" onClick={() => dismissible && onClose()} aria-hidden />
        <div
          ref={mergeRefs(ref, panelRef)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? `${id}-title` : undefined}
          aria-describedby={description ? `${id}-desc` : undefined}
          tabIndex={-1}
          data-state="open"
          className={cn('relative flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-card bg-surface shadow-lg outline-none animate-rise-in', W[size], className)}
          {...rest}
        >
          {(title || !hideClose) && (
            <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6">
              <div className="min-w-0 flex-1">
                {title && (
                  <h2 id={`${id}-title`} className="text-h3 text-ink">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={`${id}-desc`} className="mt-1 text-small text-ink-2">
                    {description}
                  </p>
                )}
              </div>
              {!hideClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('ui.close')}
                  className="-mr-2 -mt-2 inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-ink-2 hover:bg-sunken hover:text-ink"
                >
                  <X size={18} strokeWidth={1.75} aria-hidden />
                </button>
              )}
            </div>
          )}
          <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-4', !title && hideClose && 'pt-6', !footer && 'pb-6', bodyClassName)}>{children}</div>
          {footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-6 pb-6">{footer}</div>}
        </div>
      </div>
    </Portal>
  )
})
