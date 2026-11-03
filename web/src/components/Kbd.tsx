import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** Keyboard key hint: `⌘K`. */
export const Kbd = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(function Kbd({ className, ...rest }, ref) {
  return (
    <kbd
      ref={ref}
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line bg-sunken px-1 font-mono text-[11px] font-medium leading-none text-ink-2',
        className,
      )}
      {...rest}
    />
  )
})
