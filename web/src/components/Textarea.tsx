import { forwardRef, useEffect, useId, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { mergeRefs } from '@/lib/hooks'
import { Field } from './Field'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Initial visible rows (default 3). Auto-grows up to `maxRows` (default 8). */
  rows?: number
  maxRows?: number
  maxLength?: number
  /** Shows `120/500` bottom-right. */
  showCount?: boolean
  optional?: boolean
}

/** DESIGN.md §5 Textarea: auto-grow to 8 rows, counter caption ink-3. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, rows = 3, maxRows = 8, maxLength, showCount, className, id: idProp, disabled, required, optional, value, defaultValue, onChange, ...rest },
  ref,
) {
  const autoId = useId()
  const id = idProp ?? autoId
  const descId = `${id}-desc`
  const inner = useRef<HTMLTextAreaElement>(null)
  const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? ''))
  const current = value !== undefined ? String(value ?? '') : uncontrolled

  useEffect(() => {
    const el = inner.current
    if (!el) return
    el.style.height = 'auto'
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22
    const pad = 20
    const max = line * maxRows + pad
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [current, maxRows])

  const count = showCount ? (
    <span className={cn('tabular-nums', maxLength && current.length > maxLength && 'text-danger')}>
      {current.length}
      {maxLength ? `/${maxLength}` : ''}
    </span>
  ) : null

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} descriptionId={descId} required={required} optional={optional} labelEnd={count} className={className}>
      <textarea
        ref={mergeRefs(ref, inner)}
        id={id}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        required={required}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => {
          if (value === undefined) setUncontrolled(e.target.value)
          onChange?.(e)
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? descId : undefined}
        data-state={error ? 'error' : disabled ? 'disabled' : undefined}
        className={cn(
          'w-full resize-none rounded-ctl border bg-surface px-3 py-2.5 text-body text-ink transition-[border-color] duration-token-fast placeholder:text-ink-3',
          'focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-focus',
          error ? 'border-danger' : 'border-line-strong hover:border-ink-3',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        {...rest}
      />
    </Field>
  )
})
