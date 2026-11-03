import { forwardRef, useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { mergeRefs } from '@/lib/hooks'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: ReactNode
  description?: ReactNode
  indeterminate?: boolean
  error?: boolean
}

/** DESIGN.md §5 Checkbox: 18 px box, 44 px row hit area. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, indeterminate, error, className, id: idProp, disabled, checked, ...rest },
  ref,
) {
  const autoId = useId()
  const id = idProp ?? autoId
  const inner = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = !!indeterminate
  }, [indeterminate])
  const state = indeterminate ? 'indeterminate' : checked ? 'checked' : 'unchecked'
  return (
    <label
      htmlFor={id}
      data-state={state}
      className={cn(
        'group/cb relative flex min-h-11 cursor-pointer items-start gap-3 py-2.5 select-none',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <span className="relative mt-0.5 inline-flex size-[18px] shrink-0">
        <input
          ref={mergeRefs(ref, inner)}
          id={id}
          type="checkbox"
          disabled={disabled}
          checked={checked}
          aria-checked={indeterminate ? 'mixed' : undefined}
          className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-xs disabled:cursor-not-allowed"
          {...rest}
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none inline-flex size-[18px] items-center justify-center rounded-xs border bg-surface text-transparent transition-[background-color,border-color,color] duration-token-fast',
            error ? 'border-danger' : 'border-line-strong group-hover/cb:border-ink-3',
            'peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent peer-indeterminate:border-accent peer-indeterminate:bg-accent peer-indeterminate:text-on-accent',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
          )}
        >
          {indeterminate ? <Minus size={14} strokeWidth={3} /> : <Check size={14} strokeWidth={3} />}
        </span>
      </span>
      {(label || description) && (
        <span className="flex min-w-0 flex-col">
          {label && <span className="text-body text-ink">{label}</span>}
          {description && <span className="text-small text-ink-3">{description}</span>}
        </span>
      )}
    </label>
  )
})
