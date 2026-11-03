import { forwardRef, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'
import { mergeRefs } from '@/lib/hooks'
import { Field } from './Field'

export type InputSize = 'sm' | 'md' | 'lg'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: InputSize
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Text before the value, e.g. `$` */
  prefix?: ReactNode
  /** Text after the value, e.g. `/mo` */
  suffix?: ReactNode
  iconLeft?: ReactNode
  /** Shows an × button when there is a value; calls onChange with '' */
  clearable?: boolean
  /** Wrapper class (the input's own class goes to `inputClassName`) */
  inputClassName?: string
  optional?: boolean
}

const H: Record<InputSize, string> = { sm: 'h-8 text-small', md: 'h-10 text-body', lg: 'h-12 text-body-lg' }

export const inputBoxClasses = (opts: { error?: boolean; size?: InputSize; disabled?: boolean; className?: string }) =>
  cn(
    'flex w-full items-center gap-2 rounded-ctl border bg-surface px-3 text-ink transition-[border-color,box-shadow] duration-token-fast',
    'focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
    opts.error ? 'border-danger' : 'border-line-strong hover:border-ink-3',
    opts.disabled && 'cursor-not-allowed opacity-50',
    H[opts.size ?? 'md'],
    opts.className,
  )

/** DESIGN.md §5 Input. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    size = 'md',
    label,
    hint,
    error,
    prefix,
    suffix,
    iconLeft,
    clearable,
    className,
    inputClassName,
    id: idProp,
    disabled,
    required,
    optional,
    value,
    defaultValue,
    onChange,
    type = 'text',
    ...rest
  },
  ref,
) {
  const t = useT()
  const autoId = useId()
  const id = idProp ?? autoId
  const descId = `${id}-desc`
  const inner = useRef<HTMLInputElement>(null)
  const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? ''))
  const current = value !== undefined ? String(value ?? '') : uncontrolled
  const showClear = clearable && current.length > 0 && !disabled

  const clear = () => {
    const el = inner.current
    if (!el) return
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(el, '')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.focus()
  }

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} descriptionId={descId} required={required} optional={optional} className={className}>
      <div className={inputBoxClasses({ error: !!error, size, disabled })} data-state={error ? 'error' : disabled ? 'disabled' : undefined}>
        {iconLeft && (
          <span className="inline-flex shrink-0 text-ink-3 [&>svg]:size-4" aria-hidden>
            {iconLeft}
          </span>
        )}
        {prefix && (
          <span className="shrink-0 text-ink-3" aria-hidden>
            {prefix}
          </span>
        )}
        <input
          ref={mergeRefs(ref, inner)}
          id={id}
          type={type}
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
          className={cn('min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3 disabled:cursor-not-allowed', inputClassName)}
          {...rest}
        />
        {suffix && (
          <span className="shrink-0 text-ink-3" aria-hidden>
            {suffix}
          </span>
        )}
        {showClear && (
          <button
            type="button"
            onClick={clear}
            aria-label={t('ui.clear')}
            className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-pill text-ink-3 hover:bg-sunken hover:text-ink"
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
    </Field>
  )
})
