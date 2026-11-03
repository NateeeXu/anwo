import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** Screen-reader-only text. */
export const VisuallyHidden = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(function VisuallyHidden(
  { className, ...rest },
  ref,
) {
  return <span ref={ref} className={cn('sr-only', className)} {...rest} />
})
