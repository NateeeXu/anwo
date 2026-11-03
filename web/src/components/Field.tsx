import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  optional?: boolean
  /** id of the control the label points to */
  htmlFor?: string
  /** id for the hint/error text (link via aria-describedby) */
  descriptionId?: string
  children: ReactNode
  /** Right side of the label row (e.g. counter, "forgot?" link). */
  labelEnd?: ReactNode
}

/** Label (caption ink-2) above, control, then hint (small ink-3) or error (small danger + icon). */
export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  { label, hint, error, required, optional, htmlFor, descriptionId, labelEnd, className, children, ...rest },
  ref,
) {
  const t = useT()
  return (
    <div ref={ref} className={cn('flex flex-col gap-1.5', className)} data-state={error ? 'error' : undefined} {...rest}>
      {(label || labelEnd) && (
        <div className="flex items-center justify-between gap-2">
          {label ? (
            <label htmlFor={htmlFor} className="text-caption text-ink-2">
              {label}
              {required && (
                <span className="ml-0.5 text-danger" aria-hidden>
                  *
                </span>
              )}
              {optional && <span className="ml-1 font-regular text-ink-3">({t('ui.optional')})</span>}
            </label>
          ) : (
            <span />
          )}
          {labelEnd && <span className="text-caption text-ink-3">{labelEnd}</span>}
        </div>
      )}
      {children}
      {error ? (
        <p id={descriptionId} className="flex items-start gap-1 text-small text-danger" role="alert">
          <CircleAlert size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={descriptionId} className="text-small text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
})
