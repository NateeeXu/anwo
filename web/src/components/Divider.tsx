import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
  /** Optional centered label (small ink-3). */
  label?: ReactNode
}

/** Hairline divider. */
export const Divider = forwardRef<HTMLDivElement, DividerProps>(function Divider(
  { orientation = 'horizontal', label, className, ...rest },
  ref,
) {
  if (orientation === 'vertical') {
    return <div ref={ref} role="separator" aria-orientation="vertical" className={cn('h-5 w-px self-center bg-line', className)} {...rest} />
  }
  if (label) {
    return (
      <div ref={ref} role="separator" className={cn('flex items-center gap-3 text-small text-ink-3', className)} {...rest}>
        <span className="h-px flex-1 bg-line" />
        <span>{label}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    )
  }
  return <div ref={ref} role="separator" className={cn('h-px w-full bg-line', className)} {...rest} />
})
