import { cloneElement, isValidElement, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useAnchorPosition, type Side } from '@/lib/hooks'
import { Portal } from './Portal'

export interface TooltipProps {
  content: ReactNode
  side?: Side
  /** ms before showing on hover (default 400) */
  delay?: number
  /** A single element that accepts mouse/focus handlers and a ref. */
  children: ReactElement
  className?: string
  disabled?: boolean
}

/** DESIGN.md §5 Tooltip: inverse pill, no arrow, hover + focus. Never holds essential info. */
export function Tooltip({ content, side = 'top', delay = 400, children, className, disabled }: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLElement | null>(null)
  const floatRef = useRef<HTMLDivElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pos = useAnchorPosition(anchorRef, floatRef, open, { side, align: 'center', gap: 6 })

  const show = (immediate = false) => {
    if (disabled) return
    if (timer.current) clearTimeout(timer.current)
    if (immediate) setOpen(true)
    else timer.current = setTimeout(() => setOpen(true), delay)
  }
  const hide = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setOpen(false)
  }

  if (!isValidElement(children)) return children
  const child = children as ReactElement<Record<string, unknown>>
  const p = child.props
  const trigger = cloneElement(child, {
    ref: (el: HTMLElement | null) => {
      anchorRef.current = el
      const r = (child as unknown as { ref?: unknown }).ref ?? p.ref
      if (typeof r === 'function') r(el)
      else if (r && typeof r === 'object') (r as { current: unknown }).current = el
    },
    'aria-describedby': open ? id : (p['aria-describedby'] as string | undefined),
    onMouseEnter: (e: unknown) => {
      ;(p.onMouseEnter as ((e: unknown) => void) | undefined)?.(e)
      show()
    },
    onMouseLeave: (e: unknown) => {
      ;(p.onMouseLeave as ((e: unknown) => void) | undefined)?.(e)
      hide()
    },
    onFocus: (e: unknown) => {
      ;(p.onFocus as ((e: unknown) => void) | undefined)?.(e)
      show(true)
    },
    onBlur: (e: unknown) => {
      ;(p.onBlur as ((e: unknown) => void) | undefined)?.(e)
      hide()
    },
    onKeyDown: (e: KeyboardEvent) => {
      ;(p.onKeyDown as ((e: unknown) => void) | undefined)?.(e)
      if (e.key === 'Escape') hide()
    },
  })

  return (
    <>
      {trigger}
      {open && content && (
        <Portal>
          <div
            ref={floatRef}
            id={id}
            role="tooltip"
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className={cn(
              'pointer-events-none z-layer-tooltip max-w-72 rounded-sm bg-inverse px-2 py-1.5 text-caption font-medium text-ink-inverse shadow-md animate-fade-in',
              className,
            )}
          >
            {content}
          </div>
        </Portal>
      )}
    </>
  )
}
