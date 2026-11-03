import { forwardRef, type SVGAttributes } from 'react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'

export interface SpinnerProps extends SVGAttributes<SVGSVGElement> {
  /** px; default 16 */
  size?: number
  /** Adds an accessible label (default: hidden decorative). */
  label?: string
}

/** 16 px ring spinner in currentColor. */
export const Spinner = forwardRef<SVGSVGElement, SpinnerProps>(function Spinner({ size = 16, label, className, ...rest }, ref) {
  const t = useT()
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('shrink-0 animate-spin motion-reduce:animate-none', className)}
      role={label ? 'img' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      <title>{label ?? t('ui.loading')}</title>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
})
